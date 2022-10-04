function isKickOffTestComment(comment)
  {
    const kickoffTestPattern = /@bot[   ]+kick[   ]*off[  ]+test[s]?/i;
    return kickoffTestPattern.test(comment);
  }

  module.exports = { isKickOffTestComment };