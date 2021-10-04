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
        const stats = problems.stat_status_pairs.filter(x => x.paid_only && !fs.existsSync(`${x.stat.frontend_question_id}.${x.stat.question__title_slug}.txt`))
        stats.sort((a, b) => (a.stat.question_id > b.stat.question_id) ? 1: -1);
        const result = stats.map(p => 
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
        const stats = problems.stat_status_pairs.filter(x => x.paid_only )
        const problemMap = new Map(stats.map(s => [s.stat.question__title_slug, s.stat.frontend_question_id]))
        const result = tags.map(p => 
            limit(async () => {
                return await this.merge(p, problemMap);
            }));

        await Promise.all(result);
        await this.closeBrowser();
        console.log("done");
    }

    async mergeByCompany() {
        const company = ["linkedin"]
        let problems = JSON.parse(fs.readFileSync("linkedin.json"));
        const problemMap = new Map(problems.map(s => [s.titleSlug, s.questionFrontendId]))
        console.log(problemMap);
        const result = company.map(p => 
            limit(async () => {
                return await this.mergeFile(Array.from(problemMap.keys()), problemMap, p);
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

        // console.log(problems);

        await mergeFile(problems, problemMap, tag)

        await page.close();
    }

    async mergeFile(problems, problemMap, tag) {
        const target = `tags/${tag}.txt`;

        problems.forEach(p => {
            console.log(p);
            const fileName = `${problemMap.get(p)}.${p}.txt`;
            if (fs.existsSync(fileName)) {
                console.log(fileName);
                const content = fs.readFileSync(fileName);
                fs.writeFileSync(target, content, {'flag':'a+'});
            }
            
        })
    }

    async getNewPage() {
        const page = await this.browser.newPage();
        await page.setCacheEnabled(false);
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        );
        return page;
    }

    async downloadProblem(problem) {
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
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();
        // await page.setViewport({width: 1200, height: 720});
        // await page.goto('https://leetcode.com/accounts/login/'); // wait until page load
        // await page.type('#id_login', 'jianmei8725@gmail.com');
        // await page.type('#id_password', 'yyzjrA25');
        // // click and wait for navigation
        // await Promise.all([
        //     page.click('#signin_btn'),
        //     page.waitForNavigation(),
        // ]);
        // const cookiesFilePath = 'cookies.json';
        // // Save Session Cookies
        // const cookiesObject = await page.cookies()
        // // Write cookies to temp file to be used in other profile pages
        // fs.writeFile(cookiesFilePath, JSON.stringify(cookiesObject),
        //  function(err) { 
        //   if (err) {
        //   console.log('The file could not be written.', err)
        //   }
        //   console.log('Session has been successfully saved')
        // })
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
    return l.mergeByCompany();
})
.catch(console.error);


