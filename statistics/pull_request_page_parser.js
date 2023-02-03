const request = require('request');
const cheerio = require('cheerio');

const selfReviewRequestPattern = ' self-requested a review'
const reviewerRequestedPattern = ' requested a review from '
const assigned = ' assigned '

const getPage = (url, cb ) => {
    request(url, {
        timeout: 3000
    }, (error, response, body) => {
        if(!error) {
            cb(body);
        }
    });
};

const parsePage = ( data ) => {
    const $ = cheerio.load(data);
    let output = [];
    $( ".TimelineItem-body" ).each( (_, elem ) => {
        let datum = $(elem).text().replace(/(\s+)/g, ' ');
        let requestSender;
        let requestedReviewer;
        let updatedTime;
        let indexRequested = datum.indexOf(selfReviewRequestPattern);
        if (indexRequested >= 0) {
            updatedTime = $(elem).find('relative-time');
            requestSender = datum.substring(0, indexRequested).trim();
            requestedReviewer = requestSender;
            output.push({
                requested_sender: requestSender,
                requested_reviewer: requestedReviewer,
                updated_time: updatedTime.attr().datetime
            });
        }
        else {
            indexRequested = datum.indexOf(reviewerRequestedPattern);
            if (indexRequested >= 0) {
                updatedTime = $(elem).find('relative-time');
                requestSender = datum.substring(0, indexRequested).trim();
                requestedReviewer = datum.substring(indexRequested + reviewerRequestedPattern.length);
                requestedReviewer = requestedReviewer.substring(0, requestedReviewer.indexOf(' ')).trim();
                output.push({
                    requested_sender: requestSender,
                    requested_reviewer: requestedReviewer,
                    updated_time: updatedTime.attr().datetime
                });
            }
            else {
                indexRequested = datum.indexOf(assigned);
                if (indexRequested >= 0) {
                    updatedTime = $(elem).find('relative-time');
                    requestSender = datum.substring(0, indexRequested).trim();
                    requestedReviewer = datum.substring(indexRequested + assigned.length);
                    requestedReviewer = requestedReviewer.substring(0, requestedReviewer.indexOf(' ')).trim();
                    output.push({
                        requested_sender: requestSender,
                        requested_reviewer: requestedReviewer,
                        updated_time: updatedTime.attr().datetime
                    });
                }
            }
        }
    });
    return output;
};

module.exports = { getPage, parsePage }
