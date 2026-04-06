document.addEventListener('DOMContentLoaded', () => {
    // Find all elements with a data-i18n attribute
    const i18nElements = document.querySelectorAll('[data-i18n]');
    
    i18nElements.forEach(element => {
        const messageKey = element.getAttribute('data-i18n');
        const translatedMessage = chrome.i18n.getMessage(messageKey);
        
        if (translatedMessage) {
            if (element.tagName === 'TITLE') {
                document.title = translatedMessage;
            } else {
                // Using innerHTML so tags like <strong> are rendered properly
                element.innerHTML = translatedMessage; 
            }
        }
    });

    // Optionally configure the HTML lang attribute for accessibility
    document.documentElement.lang = chrome.i18n.getUILanguage();
});