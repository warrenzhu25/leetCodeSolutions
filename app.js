const puppeteer = require("puppeteer");
const pLimit = require("p-limit");
const slugify = require("slugify");
const fs = require("fs");
const { promisify } = require("util");
const { URL } = require("url");

const limit = pLimit(3);
const writeFile = promisify(fs.writeFile);
const mkDir = promisify(fs.mkdir);

const problemUrl = process.argv[2];
if (!problemUrl || !isValidURL(problemUrl)) {
    throw new Error("Invaid url");
}

const url = `${problemUrl}/discuss/?currentPage=1&orderBy=most_votes`;

const { origin } = new URL(url);

if (origin !== "https://leetcode.com") {
    throw new Error(`${url} is not a leetcode url`);
}

class LeetCodeScrapper {
    constructor(browser) {
        this.browser = browser;
        this.url = url;
    }

    async getNewPage() {
        const page = await this.browser.newPage();
        await page.setCacheEnabled(false);
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );
        return page;
    }

    async getSolutionLinks() {
        const page = await this.getNewPage();
        await page.goto(this.url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".topic-item-wrap__2FSZ");

        const title = await page.$eval(
            ".title__27Kb",
            el => el.textContent
        );

        const elements = await page.$$(".topic-item-wrap__2FSZ");

        const input = elements.slice(0, 5).map(el =>
            limit(async () => {
                const solution = await this.getSolutionDetails(el);
                return solution;
            })
        );

        const solutionData = await Promise.all(input);

        await this.closeBrowser();
        return { [title]: solutionData };
    }

    async getSolutionDetails(el) {
        const title = await el.$eval(
            ".topic-title__3LYM",
            el => el.textContent
        );
        const solutionLink = await el.$eval(
            ".title-link__1ay5",
            el => `${origin}${el.getAttribute("href")}`
        );
        const solution = await this.getSolution(solutionLink);

        return { solutionLink, title, solution };
    }

    async getSolution(link) {
        const page = await this.getNewPage();
        await page.goto(link);

        await page.waitForSelector(".discuss-markdown-container");

        const markdown = await page.$eval(
            ".discuss-markdown-container",
            el => el.textContent
        );
        await page.close();
        return markdown;
    }

    async closeBrowser() {
        return this.browser.close();
    }

    static async getLeetCodeInstance(url) {
        const browser = await puppeteer.launch({ headless: true });
        return new LeetCodeScrapper(browser, url);
    }
}

LeetCodeScrapper.getLeetCodeInstance(url)
    .then(leetCode => {
        return leetCode.getSolutionLinks();
    })
    .then(saveToFile)
    .catch(console.error);

async function saveToFile(solutions) {
    const [title, answers] = Object.entries(solutions).pop();
    const questionTitle = slugify(title);
    writeFile(`${questionTitle}.txt`, `${title}\r\n\r\n`,  {'flag':'a'})
    return Promise.all(
        answers.map(({ title, solution }) =>
            writeFile(`${questionTitle}.txt`, `${title}\r\n\r\n${solution}\r\n\r\n`,  {'flag':'a'})
        )
    );
}

function isValidURL(url) {
    try {
        new URL(url);
        return true;
    } catch (err) {
        return false;
    }
}
