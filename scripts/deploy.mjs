// بيبني الموقع ويرفعه على فرع gh-pages (GitHub Pages)
import { execSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'

const run = (cmd, cwd) => execSync(cmd, { stdio: 'inherit', cwd })
const remote = execSync('git remote get-url origin').toString().trim()

run('npm run build')
writeFileSync('dist/.nojekyll', '')
rmSync('dist/.git', { recursive: true, force: true })
run('git init -q -b gh-pages', 'dist')
run('git add -A', 'dist')
run(`git -c user.name="deploy" -c user.email="deploy@local" commit -q -m "deploy ${new Date().toISOString()}"`, 'dist')
run(`git push -q -f ${remote} gh-pages`, 'dist')
rmSync('dist/.git', { recursive: true, force: true })
console.log('تم الرفع على gh-pages')
