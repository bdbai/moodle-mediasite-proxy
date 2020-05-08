const $mediaLis = Array
    .from(document.querySelectorAll('li.activity.mediasite.modtype_mediasite'))

/**
 * @type {(() => void)[]}
 */
const coverplayReadyCallbacks = []

/**
 * @param {string} moodleId 
 * @returns {Promise<any>}
 */
const getPlayerOptionsAsync = moodleId => new Promise((resolve, _reject) => chrome.runtime.sendMessage({
    type: 'getPlayerOptions',
    moodleId
}, resolve))

/**
 * @param {Element} $el 
 */
function removeYuiIds($el) {
    if ($el.id.startsWith('yui_')) {
        $el.id = ''
    }
    Array.from($el.children).forEach(removeYuiIds)
}

/**
 * 
 * @param {Element} $li
 */
async function collectFromGetPlayerOptions($li) {
    if (!(await settingsAsync).extractInfo) {
        return
    }
    const $backup = $li.cloneNode(true)
    removeYuiIds($backup)
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

    function reload() {
        $li.before($backup)
        // TODO: remove event listeners
        $li.remove()
        collectFromGetPlayerOptions($backup)
    }

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

    // Append embedded player
    if ($con.getElementsByTagName('iframe').length === 0) {
        const $embedText = document.createElement('h5')
        $embedText.innerText = 'Embedded Player'
        const $btn = document.createElement('button')
        $btn.innerText = 'Load Embedded Player'
        $btn.className = 'center btn btn-primary'
        $btn.addEventListener('click', async e => {
            e.preventDefault()
            const $player = document.createElement('iframe')
            $player.allowFullscreen = true
            $player.src = `https://l.xmu.edu.my/mod/mediasite/content_launch.php?id=${id}&coverplay=1`
            $player.className = 'mediasite-content-iframe'
            $con.classList.add('playing')
            $btn.before($player)
            $btn.remove()

            if ((await settingsAsync).autoplay) {
                coverplayReadyCallbacks.push(function cb() {
                    setTimeout(() => {
                        $player.contentWindow.postMessage({ type: 'play' }, MEDIASITE_ORIGIN)
                    }, 500)
                    setTimeout(() => {
                        const index = coverplayReadyCallbacks.indexOf(cb)
                        if (~index) {
                            coverplayReadyCallbacks.splice(index, 1)
                        }
                    }, 0)
                })
            }

            // When the container collapses, reload
            $summary.addEventListener('click', _e => {
                if ($con.open) {
                    reload()
                }
            })
        })

        $con.appendChild($embedText)
        $con.appendChild(document.createElement('hr'))
        $con.appendChild($btn)
    }

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
    $portionCanvas.className = 'mediasite-proxy-portion'
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
    settingsAsync.then(({ extractInfo }) => {
        if (!extractInfo) {
            return
        }
        const observer = new IntersectionObserver(e => {
            e
                .filter(i => i.isIntersecting)
                .map(i => i.target)
                .forEach($li => (observer.unobserve($li), collectFromGetPlayerOptions($li)))
        }, { threshold: 1.0 })
        $mediaLis.forEach($li => observer.observe($li))
    })

    // Allow Mediasite content iframes to enter fullscreen mode
    for (const $iframe of document.querySelectorAll('iframe.mediasite-content-iframe')) {
        $iframe.allowFullscreen = true
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

window.addEventListener('message', e => {
    if (typeof e.data === 'string') {
        const { event = '' } = JSON.parse(e.data)
        if (event === 'playcoverready') {
            coverplayReadyCallbacks.forEach(fn => fn())
        }
    }
})

console.log('Listening on messages')
