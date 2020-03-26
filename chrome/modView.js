function formatTime(seconds) {
    return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`
}

const getAutoplaySettingAsync = () => new Promise((resolve, reject) =>
    chrome.storage.sync.get({ autoplay: true }, ({ autoplay }) => {
        resolve(autoplay)
    }))

window.addEventListener('message', async e => {
    console.debug('Got message', e.data)
    if (e.data.type === 'getPlayerOptions') {
        e.stopImmediatePropagation()
        const {
            directUrls,
            slideStreams,
            title,
            coverages, // second!
            duration
        } = e.data
        const $con = document.createElement('div')

        // Append media info
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

        // Append unwatched periods
        const totalSeconds = Math.floor(duration / 1e3)
        // Assume coverages do not overlap
        const unwatchedPeriods = []
        let lastWatchedSecond = 0
        for (const {
            Duration: duration,
            StartTime: startTime
        } of coverages) {
            if (startTime > lastWatchedSecond) {
                unwatchedPeriods.push([lastWatchedSecond, startTime])
            }
            lastWatchedSecond = Math.min(totalSeconds, duration + startTime)
        }
        if (lastWatchedSecond < totalSeconds) {
            unwatchedPeriods.push([lastWatchedSecond, totalSeconds])
        }

        const $unwatchedList = document.createElement('ol')
        if (unwatchedPeriods.length > 0) {
            const $unwatchedTitle = document.createElement('h5')
            $unwatchedTitle.innerText = 'Unwatched portions'
            $con.appendChild($unwatchedTitle)
        }
        for (const [start, end] of unwatchedPeriods) {
            const $unwatched = document.createElement('li')
            const period = end - start
            $unwatched.innerText = `${
                formatTime(start)} - ${formatTime(end)} (${period} second${
                period === 1 ? '' : 's'})`
            $unwatchedList.appendChild($unwatched)
        }
        if (unwatchedPeriods.length > 0) {
            $con.appendChild($unwatchedList)
        }

        const $cardBody = document.querySelector('#region-main .card-body')
        $cardBody.appendChild($con)
    } else if (typeof e.data === 'string') {
        let data = { event: '' }
        try {
            data = JSON.parse(e.data)
        } catch (syntaxErr) {
            return
        }
        if (data.event === 'playcoverready'
            && await getAutoplaySettingAsync()
            && document.referrer
            && document.referrer.startsWith('https://l.xmu.edu.my/course/view.php')) {
            /** @type {HTMLIFrameElement} */
            const $iframe = document.querySelector('iframe.mediasite_lti_courses_iframe')
            $iframe.contentWindow.postMessage({ type: 'play' }, 'https://xmum.mediasitecloud.jp')
        }
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
    html.mediasite-proxy-fullscreen {
        scrollbar-width: none; /* Hide scrollbar on Firefox */
    }

    .mediasite-proxy-fullscreen body::-webkit-scrollbar {
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
        document.documentElement.classList.toggle('mediasite-proxy-fullscreen')
    })
    $con.prepend($control)
})

console.log('Listening on messages')
