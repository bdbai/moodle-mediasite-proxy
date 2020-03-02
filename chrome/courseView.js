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

/**
 * @type {Promise<[string, HTMLDivElement]>[]}
 */
const mediaElements = Array
    .from(document.querySelectorAll('li.activity.mediasite.modtype_mediasite'))
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
            mediasiteId
        } = e.data
        const con = await findAsync(mediaElements, ([mId, _$c]) => mId === mediasiteId);
        if (!con) {
            console.debug('Cannot find corresponding media element from message', e.data)
            return
        }
        const [_, $con] = con

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
    }
})

console.log('Listening on messages')
