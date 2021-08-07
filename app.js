const puppeteer = require("puppeteer");
const pLimit = require("p-limit");
const slugify = require("slugify");
const fs = require("fs");
const { promisify } = require("util");
const { URL } = require("url");

const limit = pLimit(5);
const pageLimit = pLimit(20)
const writeFile = promisify(fs.writeFile);
const mkDir = promisify(fs.mkdir);

class LeetCodeScrapper {
    constructor(browser) {
        this.browser = browser;
    }

    async downloadAll() {
        let problems = JSON.parse(fs.readFileSync("leetcode.json"));
        const stats = problems.stat_status_pairs.filter(x => !x.paid_only )
        stats.sort((a, b) => (a.stat.question_id > b.stat.question_id) ? 1: -1);
        const result = stats.slice(175, 1000).map(p => 
            limit(async () => {
                return await this.getSolutionLinks(p);
            }));

        await Promise.all(result);
        await this.closeBrowser();
        console.log("done");
    }

    async mergeByTag() {
        const tags = ["binary-search", "dynamic-programming", "depth-first-search", "breadth-first-search", "two-pointers", "backtracking","prefix-sum", "sorting", "sliding-window", "binary-tree"]
        let problems = JSON.parse(fs.readFileSync("leetcode.json"));
        const stats = problems.stat_status_pairs.filter(x => !x.paid_only )
        const problemMap = new Map(stats.map(s => [s.stat.question__title_slug, s.stat.frontend_question_id]))
        const result = tags.map(p => 
            limit(async () => {
                return await this.merge(p, problemMap);
            }));

        await Promise.all(result);
        await this.closeBrowser();
        console.log("done");
    }

    async merge(tag, problemMap) {
        const url = `https://leetcode.com/tag/${tag}/`;
        console.log(url);
        const page = await this.getNewPage();
        await page.setDefaultTimeout(60000);

        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".title-cell__ZGos > a");

        const problems = await page.$$eval(
            ".title-cell__ZGos > a",
            els => els.map(el => `${el.getAttribute("href")}`.split("/").pop())
        );

        console.log(problems);

        const target = `tags/${tag}.txt`;

        problems.forEach(p => {
            const fileName = `${problemMap.get(p)}.${p}.txt`;
            console.log(fileName);
            if (fs.existsSync(fileName)) {
                fs.writeFileSync(target, fs.readFileSync(fileName), {'flag':'a+'});
            }
            
        })

        await page.close();
    }

    async getNewPage() {
        const page = await this.browser.newPage();
        await page.setCacheEnabled(false);
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );
        return page;
    }

    async getSolutionLinks(problem) {
        const title_slug = problem.stat.question__title_slug;

        const page = await this.getNewPage();
        await page.setDefaultNavigationTimeout(0);
        await page.setDefaultTimeout(60000);

        const url = `https://leetcode.com/problems/${problem.stat.question__title_slug}/discuss/?currentPage=1&orderBy=most_votes`
        console.log(url)
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForSelector(".topic-item-wrap__2FSZ");

        const problemDesc = await this.getProblem(`https://leetcode.com/problems/${problem.stat.question__title_slug}`)

        const title = await page.$eval(
            ".title__27Kb",
            el => el.textContent
        );

        const elements = await page.$$(".topic-item-wrap__2FSZ");

        const input = elements.slice(0, 5).map(el =>
            pageLimit(async () => {
                const solution = await this.getSolutionDetails(el);
                return solution;
            })
        );

        const solutionData = await Promise.all(input);

        await page.close();

        const fileName = `${problem.stat.frontend_question_id}.${title_slug}.txt`;
        console.log(fileName);

        writeFile(fileName, `${title}\r\n\r\n${problemDesc}\r\n\r\n`,  {'flag':'a'})
        return Promise.all(
            solutionData.map(({ title, solution }) =>
                writeFile(fileName, `${title}\r\n\r\n${solution}\r\n\r\n`,  {'flag':'a'})
            )
        );
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
        console.log(`Downloading ${link}`)
        const page = await this.getNewPage();
        await page.setDefaultNavigationTimeout(0);
        await page.setDefaultTimeout(60000);
        await page.goto(link);

        await page.waitForSelector(".discuss-markdown-container");

        const markdown = await page.$eval(
            ".discuss-markdown-container",
            el => el.textContent
        );

        console.log(`Downloaded ${link}`)
        await page.close();
        return markdown;
    }

    async getProblem(link) {
        console.log(`Downloading ${link}`);
        const page = await this.getNewPage();
        await page.setDefaultNavigationTimeout(0);
        await page.setDefaultTimeout(60000);
        await page.goto(link);

        await page.waitForSelector(".content__u3I1.question-content__JfgR"); 

        const problem = await page.$eval(
            ".content__u3I1.question-content__JfgR",
            el => el.textContent
        );

        console.log(`Downloaded ${link}`)

        await page.close();
        return problem;
    }

    async closeBrowser() {
        return this.browser.close();
    }

    static async getLeetCodeInstance() {
        const browser = await puppeteer.launch({ headless: true });
        return new LeetCodeScrapper(browser);
    }
}

// LeetCodeScrapper.getLeetCodeInstance()
// .then(l => {
//     return l.downloadAll();
// })
// .catch(console.error);

LeetCodeScrapper.getLeetCodeInstance()
.then(l => {
    return l.mergeByTag();
})
.catch(console.error);


