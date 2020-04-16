function formatTime(seconds) {
    return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`
}

// TODO: replace this ad-hoc fragile solution
const $mediaLis = Array
    .from(document.querySelectorAll('#intro > div > div > div > div > a[href^="https://l.xmu.edu.my/mod/mediasite/content_launch.php?"]:first-child'))

/**
 * @param {string} moodleId 
 * @returns {Promise<any>}
 */
const getPlayerOptionsAsync = customLandingUrl => new Promise((resolve, _reject) => chrome.runtime.sendMessage({
    type: 'getPlayerOptions',
    customLandingUrl
}, resolve))

let isFullscreen = false

/**
 * @type {Promise<{ extractInfo: boolean }>}
 */
const extractInfoAsync = new Promise((resolve, _reject) => chrome.storage.sync.get({ extractInfo: true }, resolve))

/**
 * 
 * @param {Element} $a
 */
async function collectFromGetPlayerOptions($a) {
    if (!await extractInfoAsync) {
        return
    }
    const {
        directUrls,
        slideStreams,
        title,
        mediasiteId,
        coverages, // second!
        duration,
        bookmark // second!
    } = await getPlayerOptionsAsync($a.href)

    const $p = $a.parentElement.querySelector('p')
    const $con = document.createElement('div')

    // Append media info
    const $urlCon = document.createElement('p')
    const $urlText = document.createElement('strong')
    $urlText.innerText = 'Direct URLs:'
    $urlCon.appendChild($urlText)

    const $urlList = document.createElement('ul')
    for (const url of directUrls) {
        const $li = document.createElement('li')
        const $a = document.createElement('a')
        $a.href = url
        $a.innerText = url
        $li.appendChild($a)
        $urlList.appendChild($li)
    }
    $urlCon.appendChild($urlList)

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
        $urlCon.appendChild($copySlideDataBtn)
    }
    $con.appendChild($urlCon)

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

    const $unwatchedCon = document.createElement('p')
    const $unwatchedList = document.createElement('ol')
    if (unwatchedPeriods.length > 0) {
        const $unwatchedTitle = document.createElement('strong')
        $unwatchedTitle.innerText = 'Unwatched portions:'
        $unwatchedCon.appendChild($unwatchedTitle)
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
        $unwatchedCon.appendChild($unwatchedList)
    }
    $con.appendChild($unwatchedCon)

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
    const $instanceNameNode = $a.parentElement.querySelector('h3 a:last-child')
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
    $p.before($con)

    const $portionCanvas = document.createElement('canvas')
    $portionCanvas.className = 'mediasite-proxy-portion'
    $a.parentElement.querySelector('h3').after($portionCanvas)
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
!function () {
    // Collect information from GetPlayerOptions
    extractInfoAsync.then(({ extractInfo }) => extractInfo
        && Promise.all($mediaLis.map(collectFromGetPlayerOptions)))
}()
