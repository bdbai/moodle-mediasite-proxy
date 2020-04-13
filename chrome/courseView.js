const $mediaLis = Array
    .from(document.querySelectorAll('li.activity.mediasite.modtype_mediasite'))

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

/**
 * @param {string} moodleId 
 * @returns {Promise<any>}
 */
const getPlayerOptionsAsync = moodleId => new Promise((resolve, _reject) => chrome.runtime.sendMessage({
    type: 'getPlayerOptions',
    moodleId
}, resolve))

let isFullscreen = false

/**
 * @type {Promise<{ extractInfo: boolean }>}
 */
const extractInfoAsync = new Promise((resolve, _reject) => chrome.storage.sync.get({ extractInfo: true }, resolve))

/**
 * 
 * @param {Element} $el 
 */
async function collectFromGetPlayerOptions($el) {
    const id = $el.id.substr(7) // module-76543
    const playerOptions = await getPlayerOptionsAsync(id)
    const {
        directUrls,
        slideStreams,
        title,
        mediasiteId,
        coverages, // second!
        duration,
        bookmark
    } = playerOptions

    // Append media info
    const $header = document.createElement('h4')
    $header.innerText = 'Media information'
    $el.appendChild($header)

    $el.appendChild(document.createElement('hr'))

    const $title = document.createElement('p')
    $title.innerText = 'Title: ' + title
    $el.appendChild($title)

    const $urlText = document.createElement('h5')
    $urlText.innerText = 'Direct URLs'
    $el.appendChild($urlText)

    const $urlList = document.createElement('ul')
    for (const url of directUrls) {
        const $li = document.createElement('li')
        const $a = document.createElement('a')
        $a.href = url
        $a.innerText = url
        $li.appendChild($a)
        $urlList.appendChild($li)
    }
    $el.appendChild($urlList)

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
        $el.appendChild($copySlideDataBtn)
    }

    // Show completeness
    let appendix = ' '
    if (bookmark && bookmark.position) {
        const { position } = bookmark
        const progress = position / duration * 1000
        appendix += `[bookmark at ${
            Math.floor(position / 60)}:${
            Math.floor(position % 60)}(${
            progress.toLocaleString('en-US', {
                style: 'percent',
                maximumFractionDigits: 2
            })})] `
    }
    const $instanceNameNode = $el.querySelector('span.instancename')
    const $instanceNameTextNode = $instanceNameNode.childNodes[0]

    // Assume coverages do not overlap
    const totalSeconds = Math.floor(duration / 1e3)
    let coveredSeconds = 0
    for (const {
        Duration: duration,
        StartTime: startTime
    } of coverages) {
        const endTime = Math.min(duration + startTime, totalSeconds)
        coveredSeconds += endTime - startTime
    }
    appendix += `[Est. completeness = ${
        Math.min(1, coveredSeconds / totalSeconds)
            .toLocaleString('en-US', {
                style: 'percent',
                maximumFractionDigits: 2
            })
        }]`
    $instanceNameNode.setAttribute('data-original-text', $instanceNameTextNode.textContent)
    $instanceNameTextNode.textContent += appendix //` [bookmark at 1:3(5%)][Est. completeness = %]`
}

/**
 * @type {string}
 */
let defaultWindowState = 'maximized'
!function () {
    // Collect information from GetPlayerOptions
    extractInfoAsync.then(({ extractInfo }) => extractInfo
        && Promise.all($mediaLis.map(collectFromGetPlayerOptions)))

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
        border-radius: 0.3em;
        padding: 4px 10px;
        margin: 4px;
        cursor: pointer;
        transition: text-shadow 0.4s;
    }

    .mediasite-proxy-play-control:hover {
        text-shadow: 0 0 8px white;
    }

    .mediasite-content.on-fullscreen .mediasite-proxy-play-control {
        position: fixed;
        top: 0;
        right: 8px;
        z-index: 1200;
    }

    .mediasite-content.on-fullscreen iframe {
        position: fixed;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
        z-index: 1100;
        border: none;
    }`
    document.head.appendChild($style)

    // Inject full screen btn
    const cons = document.getElementsByClassName('mediasite-content')
    for (const $con of Array.from(cons)) {
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
    }

    // Collect media titles and links
    const courseId = window.location.href.match(/id=(\d+)/)[1]
    const titles = $mediaLis.map($li => {
        const id = $li.id.substr(7) // module-76543
        const $instanceName = $li.querySelector('span.instancename')
        const instancename = $instanceName.getAttribute('data-original-text')
            || $instanceName.childNodes[0].textContent
        return [id, instancename]
    })
    localStorage.setItem('mediasite_video_ids_' + courseId, JSON.stringify(titles))
}()

console.log('Listening on messages')
