// Puts the signed release APK where the download page and GitHub find it:
//   npm run apk && node scripts/release-apk.mjs
// Copies android/app/build/outputs/apk/release/app-release.apk to releases/thally.apk and writes
// releases/thally.json (version, size, SHA-256) for the page to show.
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const built = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk')
const gradle = readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8')
const version = /versionName "([^"]+)"/.exec(gradle)?.[1]
const apk = readFileSync(built)
if (!/signingConfig signingConfigs.release/.test(gradle)) throw new Error('release builds are not signed')
mkdirSync(path.join(root, 'releases'), { recursive: true })
copyFileSync(built, path.join(root, 'releases/thally.apk'))
const info = { version, size: apk.length, sha256: createHash('sha256').update(apk).digest('hex'), built: new Date().toISOString().slice(0, 10) }
writeFileSync(path.join(root, 'releases/thally.json'), JSON.stringify(info, null, 2) + '\n')
console.log(info)
