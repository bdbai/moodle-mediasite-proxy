/** @type {HTMLAnchorElement | undefined} */
let $nextPageLink = undefined
/** @type {HTMLIFrameElement} */
const $iframe = document.getElementById('contentframe')

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
    const playerOptions = await getPlayerOptionsAsync(id)
    const $con = document.createElement('div')

    // Append media info
    attachMediaInfo(playerOptions, {
        $con,
        header: true,
        mediaTitle: true,
        unwatchedAnchorPrefix: 'video',
        $unwatchedAnchor: $iframe,
        findPlayerWindow: _position => $iframe?.contentWindow
    })

    const $cardBody = document.getElementById('maincontent').parentElement
    $cardBody.appendChild($con)
}

window.addEventListener('message', async e => {
    if (e.origin === MEDIASITE_ORIGIN) {
        let data = { event: '', type: '' }
        if (typeof e.data === 'string') {
            try {
                data = JSON.parse(e.data)
            } catch (syntaxErr) {
                return
            }
        } else {
            data = e.data
        }

        /** @type {HTMLIFrameElement} */
        const $iframe = document.getElementById('contentframe')
        if (data.event === 'playcoverready'
            && (await settingsAsync).autoplay
            && document.referrer
            && (document.referrer.startsWith('https://l.xmu.edu.my/course/view.php')
                || document.referrer.startsWith('https://l.xmu.edu.my/mod/mediasite/view.php'))) {
            setTimeout(() => {
                $iframe.contentWindow.postMessage({
                    type: 'play',
                    continuousPlayEnabled: true,
                    hasNextPage: !!$nextPageLink
                }, MEDIASITE_ORIGIN)
            }, 500)
        } else if (data.type === 'requestFullscreen') {
            if (data.state === true) {
                $iframe.requestFullscreen()
            } else {
                document.exitFullscreen().catch(_e => { })
            }
        } else if (data.type === 'jumpNext' && $nextPageLink) {
            $nextPageLink.click()
        }
    }
})

!function () {
    collectFromGetPlayerOptions()

    if (typeof $iframe?.allow === 'string') {
        $iframe.allow += `; autoplay ${MEDIASITE_ORIGIN}; fullscreen ${MEDIASITE_ORIGIN}`
    } else if ($iframe) {
        $iframe.allowFullscreen = true
    }
    const $con = document.getElementById('maincontent').parentElement

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
            $nextPageLink = $link
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
