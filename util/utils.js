function isKickOffTestComment(comment)
{
    const kickoffTestPattern = /@prestobot[   ]+kick[   ]*off[  ]+test[s]?/i;
    return kickoffTestPattern.test(comment);
}

module.exports = { isKickOffTestComment };