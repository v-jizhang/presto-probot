let repo;
let octokit;

function isKickOffTestComment(comment)
{
    const kickoffTestPattern = /@prestobot[   ]+kick[   ]*off[  ]+test[s]?/i;
    return kickoffTestPattern.test(comment);
}

async function setContext(context)
{
    if (!repo) {
        repo = await context.repo();
        octokit = context.octokit;
    }
}

function getRepo() {
    return repo;
}

function getOctokit()
{
    return octokit;
}

module.exports = { isKickOffTestComment, setContext, getRepo, getOctokit };