window.addEventListener('message', e => {
    if (e.data && e.data.type === 'play') {
        document.querySelector('button.play-button').click()
        e.stopImmediatePropagation()
    }
})
