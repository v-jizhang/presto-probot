const config = require('config')
const base64 = require('js-base64').Base64

async function getCodeOwnersFileContent(context)
{
    const repo = await context.repo();
    const content = await context.octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path: '/CODEOWNERS',
    });

    return base64.decode(content.data.content);
}

async function listRecentCommitsByFile(context, filename)
{
    const repo = await context.repo();
    let numberOfMonths = config.get('file-history-months');
    const date = new Date();
    date.setMonth(date.getMonth() - numberOfMonths);

    const commits = await context.octokit.repos.listCommits({
        owner: repo.owner,
        repo: repo.repo,
        path: filename,
        since: date.toISOString(),
    });

    return commits;
}

module.exports = { getCodeOwnersFileContent, listRecentCommitsByFile };
