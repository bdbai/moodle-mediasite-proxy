const main = async () => {
    if (window.parent === window) {
        return
    }

    const $resourceId = document.getElementById('ResourceId')
    if ($resourceId === null) {
        setTimeout(main, 1000)
        return
    }
    const requestBody = {
        getPlayerOptionsRequest: {
            ResourceId: $resourceId.innerText,
            QueryString: window.location.search,
            UseScreenReader: false,
            UrlReferrer: document.getElementById('UrlReferrer').innerText
        }
    }
    const response = await fetch("https://xmum.mediasitecloud.jp/Mediasite/PlayerService/PlayerService.svc/json/GetPlayerOptions", {
        method: "POST",
        headers: {
            'Content-Type': "application/json; charset=utf-8",
        },
        body: JSON.stringify(requestBody),
        credentials: 'include'
    })
        .then(n => n.json())

    const presentation = response.d.Presentation
    const streams = presentation.Streams
    const directUrls = streams
        .filter(s => s.VideoUrls.length > 0)
        .map(s => s.VideoUrls[0].Location)
    const slideStreams = streams
        .filter(s => s.StreamType === 2)
    window.parent.postMessage({
        type: 'getPlayerOptions',
        directUrls,
        slideStreams,
        title: presentation.Title,
        mediasiteId: presentation.PresentationId
    }, 'https://l.xmu.edu.my')
    console.log('Message sent')
}

chrome.storage.sync.get({ extractInfo: true }, ({ extractInfo }) => {
    if (extractInfo) {
        main()
    }
})
