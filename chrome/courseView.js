/**
 * @template T
 * @param {T[]} arr
 * @param {(item: T) => boolean} predicate
 * @returns {T[]}
 */
function skipUntil(arr, predicate) {
    for (let i = 0; i < arr.length; i++) {
        if (predicate(arr[i])) {
            return arr.slice(i)
        }
    }
    return []
}

/**
 * @template T
 * @param {PromiseLike<T>[]} arr
 * @param {(item: T) => boolean} predicate
 * @return {Promise<T | undefined>}
 */
async function findAsync(arr, predicate) {
    for (const item of arr) {
        const result = await item
        if (predicate(result)) {
            return result
        }
    }
    return undefined
}

const $mediaLis = Array
    .from(document.querySelectorAll('li.activity.mediasite.modtype_mediasite'))

/**
 * @type {Promise<[string, HTMLDivElement]>[]}
 */
const mediaElements = $mediaLis
    .map($l => {
        const $content = $l.querySelector('div.mediasite-content')
        const id = $l.id.substr(7) // module-76543
        return fetch(`https://l.xmu.edu.my/mod/mediasite/content_launch.php?id=${id}&coverplay=1`, {
            credentials: 'include'
        })
            .then(res => res.text())
            .then(res => skipUntil(skipUntil(res
                .split('\n'), line => line.includes('name="mediasiteid"'))[0]
                .split('"'), field => field === ' value=')[1])
            .then(mediasiteId => [mediasiteId, $content])
    })

window.addEventListener('message', async e => {
    console.debug('Got message', e.data)
    if (e.data.type === 'getPlayerOptions') {
        const {
            directUrls,
            slideStreams,
            title,
            mediasiteId,
            coverages, // second!
            duration,
            bookmark
        } = e.data
        const con = await findAsync(mediaElements, ([mId, _$c]) => mId === mediasiteId);
        if (!con) {
            console.debug('Cannot find corresponding media element from message', e.data)
            return
        }
        const [_, $con] = con

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

        // Show completeness
        let $li = $con.parentElement
        while ($li && $li.tagName !== 'LI') {
            $li = $li.parentElement
        }
        if (!$li) {
            return
        }
        let appendix = ' '
        if (bookmark && bookmark.position) {
            const { position } = bookmark
            const progress = position / duration
            appendix += `[bookmark at ${
                Math.floor(position / 6e4)}:${
                Math.floor(position % 6e4 / 1e3)}(${
                progress.toLocaleString('en-US', {
                    style: 'percent',
                    maximumFractionDigits: 2
                })})] `
        }
        const $instanceNameNode = $li.querySelector('span.instancename')
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
!function () {
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
