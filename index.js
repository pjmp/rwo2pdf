#!/usr/bin/env node

import { unlink } from 'fs/promises'
import { createWriteStream, readFileSync, statSync } from 'fs'
import { exit } from 'process'
import { join } from 'path'

import { chromium } from 'playwright'
import { Document, ExternalDocument } from 'pdfjs'

async function MergePDFs(files, output) {
    const doc = new Document()

    const PDFs = files.map(file => new ExternalDocument(readFileSync(file)))

    for (const file of PDFs) {
        doc.addPagesOf(file)
    }

    const writeStream = doc.pipe(createWriteStream(output))

    await doc.end()

    await new Promise((resolve, reject) => {
        writeStream.on('close', resolve)
        writeStream.on('error', reject)
    })
}

async function GeneratePDFs() {
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
            ...pdfOptions,
            ...{
                path: title,
            },
        })

        console.log(`Generated '${title}'`)
    }

    await browser.close()

    return titles
}

async function Cleanup(files) {
    for (const file of files) {
        await unlink(file)
    }
}

async function main() {
    const dest = CLi()

    const files = await GeneratePDFs()

    // merge generated pdf files
    console.log('Merging PDFs')
    const output = 'RealWorldOcaml.pdf'
    const destPath = join(dest, output)
    await MergePDFs(files, destPath)
    console.log('PDF files merged')

    // deleted generated files
    console.log('Cleaning up PDF files')
    await Cleanup(files)

    console.log(`Done! Saved file as '${destPath}'`)
}

function CLi() {
    const args = process.argv.slice(2)
    const { name, version, dependencies } = JSON.parse(
        readFileSync('./package.json', { encoding: 'utf-8' })
    )

    if (args.length < 1) {
        return '.'
    } else if (args.length == 1) {
        let dest = args[0]

        switch (dest) {
            case '--help':
            case '-h':
                console.log(`Usage: ${name} <path>`)
                exit(0)

            case '--version':
            case '-v':
                const deps = Object.keys(dependencies)
                    .map(dep => `${dep} - ${dependencies[dep]}`)
                    .join('\n')
                console.log(`${name} v${version}\n\nDependencies:\n${deps}`)
                exit(0)

            default:
                try {
                    let stat = statSync(dest)

                    if (stat.isDirectory()) {
                        return dest
                    } else {
                        console.error(`${name}: '${dest}' is not a directory`)
                        exit(1)
                    }
                } catch (error) {
                    console.error(`${name}: ${error.message}`)
                    exit(1)
                }
        }
    } else {
        console.error(`Too arguments supplied\nUsage: ${name} <path>`)
        exit(1)
    }
}

await main()
