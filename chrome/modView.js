function formatTime(seconds) {
    return `${Math.floor(seconds / 60)} min ${seconds % 60} sec`
}

/**
 * @type {Promise<{ autoplay: boolean, extractInfo: boolean }>}
 */
const settingsAsync = new Promise((resolve, _reject) =>
    chrome.storage.sync.get({ autoplay: true, extractInfo: true }, resolve))

/**
 * @param {string} moodleId 
 * @returns {Promise<any>}
 */
const getPlayerOptionsAsync = moodleId => new Promise((resolve, _reject) => chrome.runtime.sendMessage({
    type: 'getPlayerOptions',
    moodleId
}, resolve))

async function collectFromGetPlayerOptions() {
    if (!(await settingsAsync).extractInfo) {
        return
    }
    const id = location.search.match(/id=(\d+)/)[1]
    const {
        directUrls,
        slideStreams,
        title,
        mediasiteId,
        coverages, // second!
        duration,
        bookmark // second!
    } = await getPlayerOptionsAsync(id)
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
}

window.addEventListener('message', async e => {
    if (typeof e.data === 'string') {
        let data = { event: '' }
        try {
            data = JSON.parse(e.data)
        } catch (syntaxErr) {
            return
        }

        // Wait for 500 ms to let allowfullscreen attribute on
        await delay(500)
        if (data.event === 'playcoverready'
            && (await settingsAsync).autoplay
            && document.referrer
            && document.referrer.startsWith('https://l.xmu.edu.my/course/view.php')) {
            /** @type {HTMLIFrameElement} */
            const $iframe = document.querySelector('iframe.mediasite_lti_courses_iframe')
            $iframe.contentWindow.postMessage({ type: 'play' }, 'https://mymedia.xmu.edu.cn')
        }
    }
})

!function () {
    collectFromGetPlayerOptions()

    /** @type {HTMLIFrameElement} */
    const $iframe = document.getElementById('contentframe')
    if ($iframe) {
        $iframe.allowFullscreen = true
    }
    const $con = document.querySelector('#region-main .card-body')

    // Show prev/next
    /** @type {HTMLAnchorElement} */
    const $courseLink = document.querySelector('ol.breadcrumb li.breadcrumb-item:last-child a')
    const courseId = $courseLink.href.match(/id=(\d+)/)[1]
    const videoId = window.location.href.match(/id=(\d+)/)[1]
    const titleStr = localStorage.getItem('mediasite_video_ids_' + courseId)
    let titles = []
    try {
        titles = JSON.parse(titleStr)
    } catch (parseErr) {
        return
    }
    if (titles) {
        const videoIndex = titles.indexOf(titles.find(v => v[0] === videoId))
        if (videoIndex === -1) {
            return
        }
        const $prevLi = document.createElement('li')
        $prevLi.classList.add('page-item')
        if (videoIndex > 0) {
            const [id, name] = titles[videoIndex - 1]
            /** @type {HTMLAnchorElement} */
            const $link = document.createElement('a')
            $link.href = 'https://l.xmu.edu.my/mod/mediasite/view.php?id=' + id.toString()
            $link.classList.add('page-link')
            const $icon = document.createElement('i')
            $icon.className = 'icon fa fa-chevron-left fa-fw '
            $link.appendChild($icon)
            $link.appendChild(document.createTextNode(name))
            $prevLi.appendChild($link)
        } else {
            $prevLi.classList.add('disabled')
        }

        const $nextLi = document.createElement('li')
        $nextLi.classList.add('page-item')
        if (videoIndex < titles.length - 1) {
            const [id, name] = titles[videoIndex + 1]
            /** @type {HTMLAnchorElement} */
            const $link = document.createElement('a')
            $link.href = 'https://l.xmu.edu.my/mod/mediasite/view.php?id=' + id.toString()
            $link.classList.add('page-link')
            const $icon = document.createElement('i')
            $icon.className = 'icon fa fa-chevron-right fa-fw '
            $link.appendChild(document.createTextNode(name))
            $link.appendChild($icon)
            $nextLi.appendChild($link)
        } else {
            $nextLi.classList.add('disabled')
        }

        const $ul = document.createElement('ul')
        $ul.classList.add('pagination')
        $ul.style.display = 'flex'
        $ul.style.justifyContent = 'center'
        $ul.appendChild($prevLi)
        $ul.appendChild($nextLi)
        $con.appendChild($ul)
    }
}()
