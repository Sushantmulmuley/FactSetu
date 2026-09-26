from playwright.sync_api import sync_playwright

QUESTIONS = [
    "Expense ratio of HDFC Flexi Cap Fund?",
    "What is the lock-in for HDFC ELSS Tax Saver?",
    "Minimum SIP for HDFC Mid Cap Fund?",
    "Exit load of HDFC Large Cap Fund?",
    "Riskometer of HDFC ELSS Tax Saver?",
    "Benchmark of HDFC Mid Cap Fund?",
    "How do I download my capital gains statement?",
    "Should I buy HDFC Flexi Cap Fund now?",
    "Which is better, Large Cap or Mid Cap?",
    "My PAN is ABCDE1234F, what is the expense ratio of Large Cap fund?",
]

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium")
    page = browser.new_page(viewport={"width": 480, "height": 900})
    page.goto("http://localhost:8791/index.html")
    page.wait_for_timeout(500)

    for q in QUESTIONS:
        page.fill("#query", q)
        page.click("button[type=submit]")
        page.wait_for_timeout(300)

    page.wait_for_timeout(500)
    bubbles = page.eval_on_selector_all(".msg", """els => els.map(e => ({
        role: e.className.includes('user') ? 'user' : 'bot',
        text: e.querySelector('.bubble').innerText,
        link: e.querySelector('.source-link') ? e.querySelector('.source-link').href : null
    }))""")
    for b in bubbles:
        prefix = "Q" if b["role"] == "user" else "A"
        print(f"{prefix}: {b['text']}" + (f"  [{b['link']}]" if b["link"] else ""))

    page.screenshot(path="screenshot_full.png", full_page=True)
    browser.close()
