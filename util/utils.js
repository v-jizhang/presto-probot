const config = require('config')
const { Octokit } = require("@octokit/rest");

let repo;
let octokit;

function isKickOffTestComment(comment)
{
    const kickoffTestPattern = /@prestobot[   ]+kick[   ]*off[  ]+test[s]?/i;
    return kickoffTestPattern.test(comment);
}

async function setContext(context)
{
    repo = await context.repo();
    octokit = context.octokit;
}

function getRepo() {
    if (repo) {
        return repo;
    }
    return config.get('repo');
}

function getOctokit()
{
    if (octokit) {
        return octokit;
    }
    if (process.env.GITHUB_TOKEN) {
        octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
            userAgent: 'prestoProbot v1.2.3'
        });

        return octokit;
    }
}

module.exports = { isKickOffTestComment, setContext, getRepo, getOctokit };