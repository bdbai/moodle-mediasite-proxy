const MEDIASITE_ORIGIN = 'https://mymedia.xmu.edu.cn'

/**
 * @param {EventTarget} $el 
 */
function dismissDialog($el) {
    let $dialog = $el.parentElement
    while (!$dialog.classList.contains('mediasite-proxy-dialog')) {
        $dialog = $dialog.parentElement
    }
    $dialog.style.visibility = 'hidden'
}

const fixCookieDialog = document.createElement('div')
fixCookieDialog.className = 'mediasite-proxy-dialog'
fixCookieDialog.innerHTML = `<div class="dialog">
    <p class="title">Bad ticket detected</p>
    <hr>
    <p>Fix and reload this page?</p>
    <button id="mediasite-proxy-fix-cookie-reload-btn" class="btn btn-primary">Fix</button>
    <button class="mediasite-proxy-dismiss-btn btn btn-light">Cancel</button>
</div>`
document.body.appendChild(fixCookieDialog)
document.getElementById('mediasite-proxy-fix-cookie-reload-btn').addEventListener('click', e => {
    e.preventDefault()
    chrome.runtime.sendMessage({ type: 'clearCookies' }, () => {
        location.reload()
    })
    dismissDialog(e.target)
})
for (const $el of document.getElementsByClassName('mediasite-proxy-dismiss-btn')) {
    $el.addEventListener('click', e => {
        e.preventDefault()
        dismissDialog(e.target)
    })
}

window.addEventListener('message', e => {
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

        if (data.type === 'requestFixCookie') {
            fixCookieDialog.style.visibility = 'visible'
        }
    }
})
