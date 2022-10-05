async function getCodeOwnersFileContent(context)
{
    const repo = await context.repo();
    const content = await context.octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.repo,
        path: '/CODEOWNERS',
    });

    return content;
}

module.exports = { getCodeOwnersFileContent };
