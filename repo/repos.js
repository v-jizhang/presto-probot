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

async function listContributors(context)
{
    const repo = await context.repo();
    const perPage = 100;
    let pageNumber = 0;
    const contributorLogins = new Set();
    let contributors;

    do {
        contributors = await context.octokit.repos.listContributors({
            owner: repo.owner,
            repo: repo.repo,
            per_page: perPage,
            page: pageNumber++,
        });

        for (let i = 0; i < contributors.data.length; i++) {
            contributorLogins.add(contributors.data[i].login);
        }
    } while (contributors.data.length > 0);

    return contributorLogins;
}

async function getCommitFiles(context, commit)
{
    const repo = await context.repo();
    const commitData = await context.octokit.repos.getCommit({
        owner: repo.owner,
        repo: repo.repo,
        ref: commit.sha
    });

    return commitData.data.files;
}

module.exports = { getCodeOwnersFileContent, listRecentCommitsByFile, listContributors, getCommitFiles };
