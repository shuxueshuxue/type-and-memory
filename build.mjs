// node build.mjs            build every target into dist/
// node build.mjs --serve    rebuild the standalone page on change and serve it
import { context, build } from 'esbuild'
import { cp, mkdir, rm } from 'node:fs/promises'

const serve = process.argv.includes('--serve')
const base = { bundle: true, format: 'esm', target: 'es2022', minify: !serve, sourcemap: serve, logLevel: 'info' }

await rm('dist', { recursive: true, force: true })
await mkdir('dist/web', { recursive: true })
await cp('hosts/web/index.html', 'dist/web/index.html')
await cp('hosts/web/web.css', 'dist/web/web.css')
const web = { ...base, entryPoints: ['hosts/web/main.ts'], outfile: 'dist/web/main.js' }

if (serve) {
  const ctx = await context(web)
  await ctx.watch()
  const { port } = await ctx.serve({ servedir: 'dist/web', port: Number(process.env.PORT ?? 5173) })
  console.log(`http://localhost:${port}`)
} else {
  await build(web)
  // The page as a library: one ESM file, no dependencies.
  await build({ ...base, entryPoints: ['src/index.ts'], outfile: 'dist/type-and-memory.js' })

  // The 咕咕 App, laid out as gugu-apps wants a source: dist/gugu/app is the bundle.
  const gugu = 'dist/gugu/app'
  await mkdir(gugu, { recursive: true })
  for (const file of ['manifest.json', 'main.html', 'gugu.css', 'icon.png', 'skills', 'store', 'CHANGELOG.md']) await cp(`hosts/gugu/${file}`, `${gugu}/${file}`, { recursive: true })
  // Both files stay readable: the market publishes this folder and reviewers read it.
  await build({ ...base, minify: false, entryPoints: ['hosts/gugu/main.ts'], outfile: `${gugu}/main.js` })
  await build({ ...base, minify: false, platform: 'node', entryPoints: ['hosts/gugu/tools.ts'], outfile: `${gugu}/tools.js` })

  // The Obsidian plugin: main.js, manifest.json and styles.css are the whole release.
  await mkdir('dist/obsidian', { recursive: true })
  for (const file of ['manifest.json', 'styles.css']) await cp(`hosts/obsidian/${file}`, `dist/obsidian/${file}`)
  await build({ ...base, format: 'cjs', external: ['obsidian'], entryPoints: ['hosts/obsidian/main.ts'], outfile: 'dist/obsidian/main.js' })

  // The DeepSeek Harness plugin: a host module, and a browser module in the harness's own loader format
  // (a CommonJS body handed to window.__ModuleLoader__, with react and friends required from the harness).
  const dsh = 'dist/dsh'
  await mkdir(`${dsh}/lib`, { recursive: true })
  for (const file of ['package.json', 'cordis.patch.yml']) await cp(`hosts/dsh/${file}`, `${dsh}/${file}`)
  await build({ ...base, minify: false, platform: 'node', external: ['@deepseek-ai/*'], entryPoints: ['hosts/dsh/host.ts'], outfile: `${dsh}/lib/index.js` })
  await build({
    ...base, format: 'cjs', external: ['react', '@deepseek-ai/*'], entryPoints: ['hosts/dsh/client.ts'], outfile: `${dsh}/lib/client.js`,
    banner: { js: 'window.__ModuleLoader__.load({id:`dsh-type-and-memory`,factory:require=>{var module={exports:{}};var exports=module.exports;' },
    footer: { js: 'return module.exports}});' },
  })
}

