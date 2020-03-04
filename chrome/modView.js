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

/**
 * @returns {Promise<string>}
 */
const getWindowStateAsync = () => new Promise((resolve, _reject) => chrome.runtime.sendMessage({
    type: 'getWindowState'
}, resolve))

/**
 * 
 * @param {string} state 
 */
const setWindowState = state => chrome.runtime.sendMessage({
    type: 'setWindowState',
    state
})

let isFullscreen = false

/**
 * @type {string}
 */
let defaultWindowState = 'maximized'

window.addEventListener('load', _e => {
    const $style = document.createElement('style')
    $style.innerHTML = `
    body.mediasite-proxy-fullscreen::-webkit-scrollbar {
        display: none;
    }

    .mediasite-proxy-play-control {
        font-size: 0.8em;
        position: absolute;
        right: 8%;
        background-color: #55555588;
        color: white;
        border-radius: 8%;
        padding: 4px 10px;
        margin: 4px;
        cursor: pointer;
        transition: text-shadow 0.4s;
    }

    .mediasite-proxy-play-control:hover {
        text-shadow: 0 0 8px white;
    }

    .card-body.on-fullscreen .mediasite-proxy-play-control {
        position: fixed;
        top: 0;
        right: 8px;
        z-index: 1200;
    }

    .card-body.on-fullscreen #contentframe {
        position: fixed;
        width: 100%;
        min-height: unset;
        height: 100%;
        top: 0;
        left: 0;
        z-index: 1100;
        border: none;
        border-radius: 0;
    }`
    document.head.appendChild($style)
    const $con = document.querySelector('#region-main .card-body')
    const $control = document.createElement('div')
    $control.className = 'mediasite-proxy-play-control'
    $control.innerText = 'Toggle full screen'
    $control.addEventListener('click', async e => {
        e.preventDefault()
        const currentWindowState = await getWindowStateAsync()
        if (isFullscreen) {
            setWindowState(defaultWindowState)
        } else {
            setWindowState('fullscreen')
            defaultWindowState = currentWindowState
        }
        isFullscreen = !isFullscreen
        $con.classList.toggle('on-fullscreen')
        document.body.classList.toggle('mediasite-proxy-fullscreen')
    })
    $con.prepend($control)
})

console.log('Listening on messages')
