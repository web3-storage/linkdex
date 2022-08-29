#!/usr/bin/env node

import fs from 'fs'
import sade from 'sade'
import { linkdex, decodedBlocks } from './index.js'
import { pipeline } from 'node:stream/promises'

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url)))

const cli = sade('linkdex')

cli
  .version(pkg.version)
  .example('report patial.car')

cli.command('report <car>')
  .describe('Print a linkdex report for a car')
  .option('--error-if-partial')
  .action(async (first, opts) => {
    const cars = [first, ...opts._]
    const index = new Map()
    for (const car of cars) {
      await pipeline(
        fs.createReadStream(car),
        async function * (source) {
          for await (const {src, dest} of linkdex(source)){
            let linkSet = index.get(src)
            if (!linkSet) {
              linkSet = new Set()
              index.set(src, linkSet)
            }
            if (dest) {
              linkSet.add(dest)
            }
          }
        }
      )
    }
    const res = report(index)
    console.log(JSON.stringify(res))
    if (opts['error-if-partial'] && res.structure === 'Partial') {
      console.error('Error: CAR(s) contain partial DAG')
      process.exit(1)
    }
  })

function report (index) {
  for (const [src, links] of index.entries()) {
    for (const link of links) {
      if (!index.has(link)) {
        return { structure: 'Partial', blockCount: index.size }
      }
    }
  }
  return { structure: 'Complete', blockCount: index.size }
}

cli.command('print <car>')
  .describe('Print index for a car')
  .option('--mermaid')
  .action(async (first, opts) => {
    const cars = [first, ...opts._]
    if(opts.mermaid) {
      console.log('```mermaid')
      console.log('graph LR')
    }
    for (const car of cars) {
      const inStream = fs.createReadStream(car)
      for await (const {src, dest} of linkdex(inStream)){
        console.log(dest ? `${src} --> ${dest}` : src)
      }
    }
    if(opts.mermaid) {
      console.log('```')
    }
  })

cli.command('index <car>')
  .describe('Write out an index for a car to <car>.linkdex')
  .action(async (first, opts) => {
    const cars = [first, ...opts._]
    for (const car of cars) {
      const file = `${car}.linkdex`
      await pipeline(
        fs.createReadStream(car),
        async function* (source) {
          for await (const {src, dest} of linkdex(source)){
            yield `${src} --> ${dest}\n`
          }
        },
        fs.createWriteStream(file)
      )
    }
  })

cli.parse(process.argv)
