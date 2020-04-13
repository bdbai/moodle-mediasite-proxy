function formatTime(seconds) {
    return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`
}

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
 * @param {Element} $li
 */
async function collectFromGetPlayerOptions($li) {
    if (!await extractInfoAsync) {
        return
    }
    const id = $li.id.substr(7) // module-76543
    const {
        directUrls,
        slideStreams,
        title,
        mediasiteId,
        coverages, // second!
        duration,
        bookmark // second!
    } = await getPlayerOptionsAsync(id)

    const $con = document.createElement('details')
    const $summary = document.createElement('summary')

    const $a = $li.querySelector('a')
    $a.addEventListener('click', e => {
        e.preventDefault()
        location.href = $a.getAttribute('href')
    })

    for (const $el of Array.from($li.childNodes)) {
        $li.removeChild($el)
        $summary.appendChild($el)
    }
    $con.appendChild($summary)

    // Append media info
    const $urlText = document.createElement('h5')
    $urlText.innerText = 'Direct URLs'
    $con.appendChild($urlText)
    $con.appendChild(document.createElement('hr'))

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
    let coveredSeconds = 0
    let lastWatchedSecond = 0
    for (const {
        Duration: duration,
        StartTime: startTime
    } of coverages) {
        const endTime = Math.min(duration + startTime, totalSeconds)
        coveredSeconds += endTime - startTime
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
        $con.appendChild(document.createElement('hr'))
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

    // Show bookmark position
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
    const $instanceNameNode = $con.querySelector('span.instancename')
    const $instanceNameTextNode = $instanceNameNode.childNodes[0]

    // Unwatched periods
    appendix += `[Est. completeness = ${
        Math.min(1, coveredSeconds / totalSeconds)
            .toLocaleString('en-US', {
                style: 'percent',
                maximumFractionDigits: 2
            })
        }]`
    $instanceNameNode.setAttribute('data-original-text', $instanceNameTextNode.textContent)
    $instanceNameTextNode.textContent += appendix //` [bookmark at 1:3(5%)][Est. completeness = %]`

    $li.appendChild($con)

    const $portionCanvas = document.createElement('canvas')
    $li.appendChild($portionCanvas)
    requestAnimationFrame(() => {
        const width = $portionCanvas.clientWidth
        const height = $portionCanvas.clientHeight
        $portionCanvas.width = width
        $portionCanvas.height = height
        const canvasCtx = $portionCanvas.getContext('2d')
        canvasCtx.fillStyle = '#33bbe4'
        for (const [start, end] of unwatchedPeriods) {
            const x = start * width / totalSeconds
            const rectWidth = (end - start) * width / totalSeconds
            canvasCtx.fillRect(x, 0, rectWidth, height)
        }
        if (bookmark && bookmark.position) {
            canvasCtx.fillStyle = 'black'
            const { position } = bookmark
            const x = position * width / duration * 1000 - height / 2
            canvasCtx.fillRect(x, 0, height, height)
        }
    })
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
    }

    li.mediasite canvas {
        width: 100%;
        height: 5px;
        background-color: #e6f3f3;
    }
    
    li.mediasite summary {
        display: flex;
        align-items: center;
        margin-left: -4em;
    }
    
    li.mediasite details {
        margin-left: 4em;
    }

    li.mediasite details[open] + canvas {
        display: none;
    }
    
    li.mediasite details h5 {
        margin-top: 1em;
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
