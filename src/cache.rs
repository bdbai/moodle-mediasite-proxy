use futures::future::Either;
use futures::{future, pin_mut, FutureExt, TryFutureExt};
use http_body::Body as HttpBody;
use hyper::body::{aggregate, Buf};
use hyper::client::{Client, HttpConnector};
use hyper::header::HeaderValue;
use hyper::{Body, Request, Response, StatusCode, Uri, Version};
use hyper_rustls::HttpsConnector;
use lazy_static::lazy_static;
use rustls::{
    Certificate, ClientConfig, RootCertStore, ServerCertVerified, ServerCertVerifier, TLSError,
};
use std::cmp::min;
use std::error::Error;
use std::fmt;
use std::fmt::{Display, Formatter};
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::time::delay_for;
use uuid::Uuid;
use webpki::DNSNameRef;

const HTTP_VER: Version = Version::HTTP_11;

struct UnsafeAnyServerVerifier;

impl ServerCertVerifier for UnsafeAnyServerVerifier {
    fn verify_server_cert(
        &self,
        _roots: &RootCertStore,
        _presented_certs: &[Certificate],
        _dns_name: DNSNameRef<'_>,
        _ocsp_response: &[u8],
    ) -> Result<ServerCertVerified, TLSError> {
        Ok(ServerCertVerified::assertion())
    }
}

lazy_static! {
    static ref CLIENT: Client<HttpsConnector<HttpConnector>, Body> = {
        let mut http = HttpConnector::new();
        http.set_connect_timeout(Some(Duration::from_secs(3)));
        http.enforce_http(false);
        let mut tls_config = ClientConfig::new();
        // tls_config.alpn_protocols.push(b"\x02h2".to_vec());
        tls_config.set_protocols(&["http/1.1".into()]);
        let verifier: Arc<dyn ServerCertVerifier> = Arc::new(UnsafeAnyServerVerifier);
        tls_config.dangerous().set_certificate_verifier(verifier);
        let https = HttpsConnector::from((http, tls_config));
        Client::builder()
            // .http2_only(true)
            .keep_alive_timeout(Duration::from_secs(20))
            .retry_canceled_requests(true)
            .build(https)
    };
}

enum RequestType {
    Manifest,
    /// With offset
    Audio(i32),
    /// With offset
    Video(i32),
}

struct RequestUrlInfo<'a> {
    resource_id: &'a str,
    resource_type: RequestType,
}

fn parse_proxy_url(url: &Uri) -> Option<RequestUrlInfo> {
    let mut path_segs = url.path().split('/').skip(3);
    let resource_id = path_segs.next()?.split('.').next()?;
    let _resource_id = Uuid::parse_str(resource_id).ok()?;
    let resource = path_segs.last()?;
    let mut resource_segs = resource.split(|c| c == '(' || c == '=' || c == ',');
    let resource_type = match (
        resource_segs.next()?,
        resource_segs.next()?,
        resource_segs.next()?,
    ) {
        ("manifest", _, _) => RequestType::Manifest,
        ("Fragments", "audio", offset) => RequestType::Audio(offset.parse().ok()?),
        ("Fragments", "video", offset) => RequestType::Video(offset.parse().ok()?),
        _ => return None,
    };
    Some(RequestUrlInfo {
        resource_id,
        resource_type,
    })
}

async fn request_with_concurrent(url: &Uri, count: usize) -> Result<Response<Body>, String> {
    future::select_ok((0..count).map(|_| {
        CLIENT
            .get(url.clone())
            .map(|r| r.map_err(|e| e.to_string()))
    }))
    .await
    .map(|r| r.0)
    .map_err(|e| dbg!(e))
}

#[derive(Debug)]
enum RequestError {
    NonSuccessfulStatusCode(u16),
    HyperError(hyper::Error),
    BadLength,
    Timeout(String),
}

impl From<hyper::Error> for RequestError {
    fn from(e: hyper::Error) -> Self {
        RequestError::HyperError(e)
    }
}

impl From<StatusCode> for RequestError {
    fn from(e: StatusCode) -> Self {
        RequestError::NonSuccessfulStatusCode(e.as_u16())
    }
}

impl Display for RequestError {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result<(), fmt::Error> {
        match self {
            RequestError::NonSuccessfulStatusCode(code) => {
                f.write_fmt(format_args!("Code: {}", code))
            }
            RequestError::HyperError(e) => e.fmt(f),
            RequestError::BadLength => f.write_str("Bad length"),
            RequestError::Timeout(ctx) => f.write_fmt(format_args!("Time out for {}", ctx)),
        }
    }
}

impl Error for RequestError {}

async fn try_with_timeout<T>(
    f: impl Future<Output = Result<T, RequestError>> + Unpin,
    ctx: impl AsRef<str>,
    timeout: Duration,
) -> Result<T, RequestError> {
    match future::select(f, delay_for(timeout)).await {
        Either::Left((r, _)) => r,
        Either::Right((_, _)) => Err(RequestError::Timeout(ctx.as_ref().to_string())),
    }
}

async fn try_with_retry<'a, T, E, F, U>(mut make_fut: U, max_retry: u32) -> Result<T, E>
where
    F: Future<Output = Result<T, E>> + 'a,
    U: FnMut() -> F + 'a,
{
    let mut ret = make_fut().await;
    let mut retry = 1;
    while ret.is_err() && retry < max_retry {
        ret = make_fut().await;
        retry += 1;
    }
    ret
}

async fn request_with_retry(
    mut make_req: impl FnMut() -> Request<Body>,
    max_retry: u32,
    timeout: Duration,
    ctx: impl AsRef<str>,
) -> Result<Response<Body>, RequestError> {
    let mut ret = Ok(Response::builder().body(Body::empty()).unwrap());
    for retry in 0..max_retry {
        match try_with_timeout(CLIENT.request(make_req()).err_into(), ctx.as_ref(), timeout).await {
            Ok(resp) => {
                if resp.status().is_success() {
                    ret = Ok(resp);
                    break;
                } else {
                    println!(
                        "Retry for {} because resp code = {} ({}/{})",
                        ctx.as_ref(),
                        resp.status(),
                        retry,
                        max_retry
                    );
                    ret = Err(resp.status().into())
                }
            }
            Err(e) => {
                println!(
                    "Retry for {} because {:?} ({}/{})",
                    ctx.as_ref(),
                    e,
                    retry,
                    max_retry
                );
                ret = Err(e.into())
            }
        }
        delay_for(Duration::from_millis(200)).await;
    }
    ret
}

async fn request_one_chunk<'a>(
    url: &'a Uri,
    buffer: &'a mut [u8],
    range_start: usize,
    total_len: usize,
) -> Result<(), RequestError> {
    let range_value = format!("bytes={}-{}", range_start, range_start + buffer.len() - 1);
    println!("Started chunk {}/{}", range_value, total_len);
    let start = Instant::now();
    let resp_body = request_with_retry(
        || {
            Request::get(url.clone())
                .version(HTTP_VER)
                .header("Range", &range_value)
                .body(Body::empty())
                .unwrap()
        },
        10,
        Duration::from_secs(2),
        &format!("connect chunk {}", range_value),
    )
    .await?;
    println!("Connected chunk {} in {:?}", range_value, start.elapsed());
    let start = Instant::now();
    let aggr = aggregate(resp_body).err_into();
    pin_mut!(aggr);
    try_with_timeout(aggr, &range_value, Duration::from_secs(8))
        .await?
        .copy_to_slice(buffer);
    println!(
        "Finished chunk {}/{} in {:?}",
        range_value,
        total_len,
        start.elapsed()
    );
    Ok(())
}

async fn read_data_to_slice(
    mut resp: Response<Body>,
    mut slice: &mut [u8],
) -> Result<(), RequestError> {
    let body = resp.body_mut();
    while let Some(buf) = body.data().await.transpose()? {
        if buf.has_remaining() {
            let len = min(slice.len(), buf.len());
            let (current_chunk, next_chunk) = slice.split_at_mut(len);
            current_chunk.copy_from_slice(&buf[..len]);
            if next_chunk.len() == 0 {
                break;
            }
            slice = next_chunk;
        }
    }
    Ok(())
}

async fn request_chunked(url: &Uri) -> Result<Vec<u8>, RequestError> {
    let start = Instant::now();
    let resp = request_with_retry(
        || {
            Request::builder()
                .version(HTTP_VER)
                .method("GET")
                .uri(url.clone())
                .body(Body::empty())
                .unwrap()
        },
        10,
        Duration::from_secs(3),
        "media segment info",
    )
    .await?;
    println!("media segment info done in {:?}", start.elapsed());
    let total_len = resp
        .headers()
        .get("content-length")
        .ok_or(RequestError::BadLength)?
        .to_str()
        .map_err(|_| RequestError::BadLength)?
        .parse()
        .map_err(|_| RequestError::BadLength)?;
    if total_len == 0 {
        return Ok(vec![]);
    }
    let mut buf = vec![0u8; total_len];
    const CHUNK_SIZE: usize = 200 * 1024;
    let mut futs = Vec::with_capacity(total_len / CHUNK_SIZE + 1);
    let (start_chunk, mut remaining_chunk) = buf.split_at_mut(min(CHUNK_SIZE, total_len));
    let mut proceeded_len = start_chunk.len();
    while remaining_chunk.len() > 0 {
        let (current_chunk, tail_chunk) =
            remaining_chunk.split_at_mut(min(CHUNK_SIZE, remaining_chunk.len()));
        let chunk_len = current_chunk.len();
        futs.push(async move {
            let mut ret = Ok(());
            for _ in 0..10 {
                ret = request_one_chunk(url, current_chunk, proceeded_len, total_len).await;
                if ret.is_ok() {
                    break;
                }
            }
            ret
        });
        proceeded_len += chunk_len;
        remaining_chunk = tail_chunk;
    }
    future::try_join(
        async {
            let reused_read_result = {
                let fut = read_data_to_slice(resp, start_chunk);
                pin_mut!(fut);
                try_with_timeout(fut, "media segment data", Duration::from_secs(8)).await
            };
            match reused_read_result {
                Ok(()) => Ok(()),
                Err(e) => {
                    println!("Retrieving data from media segment info failed: {:?}", e);
                    let mut ret = Ok(());
                    for _ in 0..10 {
                        ret = request_one_chunk(url, start_chunk, 0, total_len).await;
                        if ret.is_ok() {
                            break;
                        }
                    }
                    ret
                }
            }
        },
        future::try_join_all(futs),
    )
    .await?;
    Ok(buf)
}

async fn handle_manifest(url: &Uri, _info: RequestUrlInfo<'_>) -> Result<Response<Body>, String> {
    println!("Handling manifest request {}", url);
    let start = Instant::now();
    // request_with_concurrent(url, 1).await
    // TODO: 1??
    let mut ret = request_with_retry(
        || {
            Request::get(url.clone())
                .version(HTTP_VER)
                .body(Body::empty())
                .unwrap()
        },
        10,
        Duration::from_secs(5),
        "manifest",
    )
    .map_err(|e| e.to_string())
    .await;
    if let Ok(res) = ret.as_mut() {
        res.headers_mut().append(
            "Cache-Control",
            HeaderValue::from_static("public, max-age=31536000"),
        );
    }
    println!("Finished manifest in {:?}", start.elapsed());
    ret
}

async fn handle_media(url: &Uri, _info: RequestUrlInfo<'_>) -> Result<Response<Body>, String> {
    println!("Handling media from {}", url);
    let res = request_chunked(url).await.map_err(|e| {
        println!("Error request to {}, {:?}", url, e);
        e.to_string()
    })?;
    println!("Response with {} bytes to {}", res.len(), url);
    Ok(Response::builder().body(res.into()).unwrap())
    // request_with_concurrent(url, 10).await
}

pub async fn handle_request(url: Uri) -> Result<Response<Body>, String> {
    if let Some(url_info) = parse_proxy_url(&url) {
        Ok(match url_info.resource_type {
            RequestType::Manifest => handle_manifest(&url, url_info).await?,
            _ => handle_media(&url, url_info).await?,
        })
    } else {
        CLIENT.get(url).await.map_err(|e| e.to_string())
    }
}
