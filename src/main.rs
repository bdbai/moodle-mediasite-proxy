mod cache;

use hyper::header::HeaderValue;
use hyper::service::{make_service_fn, service_fn};
use hyper::{Body, Request, Response, Server, Uri};
use lazy_static::lazy_static;
use std::convert::Infallible;
use std::fs::File;
use std::io::prelude::*;
use std::net::SocketAddr;
use std::str::FromStr;
use url::form_urlencoded;

lazy_static! {
    static ref DICT_DATA: Vec<u8> = {
        let mut dict_file = File::open("dict.json")
            .expect("Cannot open dictionary file for accelerating localization requests.");
        let mut buf = Vec::with_capacity(1400000);
        dict_file
            .read_to_end(&mut buf)
            .expect("Cannot read dictionary file");
        buf.shrink_to_fit();
        buf
    };
}

fn get_target_url_from_query(url: &[u8]) -> Option<Uri> {
    form_urlencoded::parse(url)
        .find(|(k, _v)| k == "url")
        .and_then(|(_k, v)| Uri::from_str(&v).ok())
        .filter(|u| u.host().is_some())
        .filter(|u| {
            u.scheme()
                .map(|s| s.as_str())
                .map(|s| s == "http" || s == "https")
                .unwrap_or(false)
        })
}

async fn handle_req(_req: Request<Body>) -> Result<Response<Body>, String> {
    if _req.uri().path() == "/dict" {
        println!("Sending local dict file");
        return Ok(Response::builder()
            .status(200)
            .header("content-type", "text/javascript; charset=utf-8")
            .body(DICT_DATA.clone().into())
            .unwrap());
    }
    if let Some(url) = _req
        .uri()
        .query()
        .map(str::as_bytes)
        .and_then(get_target_url_from_query)
    {
        return Ok(match cache::handle_request(url).await {
            Ok(mut resp) => {
                resp.headers_mut()
                    .insert("Access-Control-Allow-Origin", HeaderValue::from_static("*"));
                resp
            }
            Err(e) => Response::builder().status(500).body(Body::from(e)).unwrap(),
        });
    }
    Ok(Response::builder()
        .status(400)
        .header("Access-Control-Allow-Origin", "*")
        .body("Unknown request".into())
        .unwrap())
}

async fn shutdown_signal() {
    // Wait for the CTRL+C signal
    tokio::signal::ctrl_c()
        .await
        .expect("failed to install CTRL+C signal handler");
}

#[tokio::main]
async fn main() {
    // We'll bind to 127.0.0.1:3000
    let addr = SocketAddr::from(([127, 0, 0, 1], 10384));

    // A `Service` is needed for every connection, so this
    // creates one from our `hello_world` function.
    let make_svc = make_service_fn(|_conn| async {
        // service_fn converts our function into a `Service`
        Ok::<_, Infallible>(service_fn(handle_req))
    });

    let server = Server::bind(&addr)
        .serve(make_svc)
        .with_graceful_shutdown(shutdown_signal());

    // Run this server for... forever!
    if let Err(e) = server.await {
        eprintln!("server error: {}", e);
    }
}
