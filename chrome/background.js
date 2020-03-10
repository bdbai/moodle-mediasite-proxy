/**
 * @type {chrome.windows.Window}
 */
let currentWindow = undefined

chrome.windows.getCurrent(w => currentWindow = w)

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const { type } = msg
    if (typeof currentWindow === 'undefined') {
        return
    }
    switch (type) {
        case 'getWindowState':
            const gotState = currentWindow.state || 'maximized'
            sendResponse(gotState)
            console.debug('getwindowstate', gotState)
            break
        case 'setWindowState':
            console.debug('setwindowstate', msg)
            const { state } = msg
            chrome.windows.update(currentWindow.id, { state }, _w => sendResponse())
    }
})

console.log('Listening messages from background')
