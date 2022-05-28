#!/usr/bin/env node

import { chromium } from 'playwright'
import { execSync } from 'child_process'
import { unlink } from 'fs/promises'

(async () => {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    await page.emulateMedia({ media: 'screen' })

    const pdfOptions = {
        printBackground: true,
    }

    // generate intro page
    const introTitle = 'Introduction.pdf'
    await page.goto('https://dev.realworldocaml.org/')
    await page.pdf({
        ...pdfOptions,
        ...{
            path: introTitle,
        },
    })
    console.log(`Generated '${introTitle}'`)

    // generate toc pages
    const tocTitle = 'Table Of Contents.pdf'
    await page.goto('https://dev.realworldocaml.org/toc.html')
    await page.pdf({
        ...pdfOptions,
        ...{
            path: tocTitle,
        },
    })
    console.log(`Generated '${tocTitle}'`)

    // aggregate all links
    const links = await page.evaluate(() => {
        return Array.from(document.querySelector('article').querySelectorAll('a'))
            .filter(a => !a.href.includes('.html#'))
            .map(a => a.href)
    })

    const titles = [introTitle, tocTitle]

    // generate contents
    for (const link of links) {
        await page.goto(link)

        const title = `${await page.title()}.pdf`

        titles.push(title)

        await page.pdf({
            printBackground: true,
            path: title,
        })

        console.log(`Generated '${title}'`)
    }

    await browser.close()

    // merge pdf files generated
    const output = 'RealWorldOcaml.pdf'
    const quoted = titles
        .map(title => {
            if (title.includes(' ')) {
                title = `'${title}'`
            }

            return title
        })
        .join(' ')

    console.log('Merging PDFs')
    execSync(
        `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.2 -r200 -dPrinted=false -dNOPAUSE -dQUIET -dBATCH -sOutputFile=${output} ${quoted}`,
    )
    console.log('PDF files merged')

    // deleted generated files
    console.log('Cleaning up PDF files')
    for (const title of titles) {
        await unlink(title)
    }

    console.log(`Done! Saved file as '${output}'`)
})()
