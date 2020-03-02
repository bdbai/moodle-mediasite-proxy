window.addEventListener('message', e => {
    console.debug('Got message', e.data)
    if (e.data.type === 'getPlayerOptions') {
        const {
            directUrls,
            slideStreams,
            title
        } = e.data
        const $con = document.createElement('div')

        const $header = document.createElement('h4')
        $header.innerText = 'Media information'
        $con.appendChild($header)

        $con.appendChild(document.createElement('hr'))

        const $title = document.createElement('p')
        $title.innerText = 'Title: ' + title
        $con.appendChild($title)

        const $urlText = document.createElement('h5')
        $urlText.innerText = 'Direct URLs'
        $con.appendChild($urlText)

        const $urlList = document.createElement('ul')
        for (const url of directUrls) {
            const $li = document.createElement('li')
            const $a = document.createElement('a')
            $a.href = url
            $a.innerText = url
            $li.appendChild($a)
            $urlList.appendChild($li)
        }
        $con.appendChild($urlList)

        for (const slideStream of slideStreams) {
            const $copySlideDataBtn = document.createElement('button')
            $copySlideDataBtn.innerText = 'Copy slide data'
            $copySlideDataBtn.addEventListener('click', ev => {
                ev.preventDefault()
                navigator.clipboard
                    .writeText(JSON.stringify(slideStream))
                    .then(() => alert('Slide data copied'))
                    .catch(e => alert('Cannot copy slide data: ' + e.toString()))
            })
            $con.appendChild($copySlideDataBtn)
        }

        const $cardBody = document.querySelector('#region-main .card-body')
        $cardBody.appendChild($con)
    }
})

console.log('Listening on messages')
