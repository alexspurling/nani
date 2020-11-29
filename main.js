const express = require('express')
const exhbs = require('express-handlebars')
const app = express()

const eachInMap = (map, block) => {
  var out = '';
  Object.keys(map).map(function(prop) {
    out += block.fn({key: prop, value: map[prop]});
  });
  return out;
};

app.engine('handlebars', exhbs({
  helpers: {
    'eachInMap': eachInMap
  }
}));

app.set('view engine', 'handlebars');

var sqlite3 = require('sqlite3').verbose();
var gravity = new sqlite3.Database('/etc/pihole/gravity.db');
var ftl = new sqlite3.Database('/etc/pihole/pihole-FTL.db');

function query(db, q, params) {
  return new Promise(function(resolve, reject) {
    db.all(q, params, function(err, rows) {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Returns a timestamp representing 5am this morning or yesterday morning
function fiveAM() {
  var curDate = new Date();
  var newDate = new Date();
  newDate.setHours(5);
  newDate.setMinutes(0);
  newDate.setSeconds(0);
  newDate.setMilliseconds(0);
  // Get time at 5am from the day before
  if (curDate.getHours() < 5) {
    newDate.setDate(curDate.getDate() - 1);
  }
  return newDate.getTime() / 1000;
}

function getDomainMatches(exactDomains, regexDomains, queriesInLastDay) {
  var domainMatches = [];
  for (var i = 0; i < queriesInLastDay.length; i++) {
    var timestamp = queriesInLastDay[i]['timestamp'];
    var domain = queriesInLastDay[i]['domain'];
    for (var x = 0; x < exactDomains.length; x++) {
      if (exactDomains[x]['domain'] == 'news.ycombinator.com') {
        // console.log(domain, exactDomains[x]['domain']);
      }
      if (domain == exactDomains[x]['domain']) {
        domainMatches.push({timestamp: timestamp, domain: domain, group: exactDomains[x]['group_id']});
      }
    }
    for (var x = 0; x < regexDomains.length; x++) {
      if (domain.match(regexDomains[x]['domain'])) {
        domainMatches.push({timestamp: timestamp, domain: domain, group: regexDomains[x]['group_id']});
      }
    }
  }
  return domainMatches;
}

function getTimesPerGroup(domainMatches) {
  var groupTimes = {};
  for (var i = 0; i < domainMatches.length; i++) {
    var match = domainMatches[i];
    var group = match['group'];
    var timestamp = match['timestamp'];
    var groupTime = groupTimes[group];
    if (groupTime == undefined) {
      groupTime = {lastTimestamp: timestamp, time: 300};
    } else {
      var timeSinceLastQuery = timestamp - groupTime['lastTimestamp'];
      if (timeSinceLastQuery > 300) {
        groupTime = {lastTimestamp: timestamp, time: groupTime['time'] + 300};
      }	else {
	groupTime = {lastTimestamp: timestamp, time: groupTime['time'] + timeSinceLastQuery}
      }
    }
    console.log("Group: " + group + ", timestamp: " + timestamp + ", groupTime: ", groupTime);
    groupTimes[match['group']] = groupTime;
  }
  return groupTimes;
}

app.get('/', async function (req, res) {

  var groups = await query(gravity, "SELECT id, name FROM \"group\"");
  console.log("Got groups: ", groups);
  var exactDomains = await query(gravity, "SELECT id, domain, group_id FROM domainlist, domainlist_by_group WHERE id = domainlist_id AND type = 1");
  console.log("Exact domains: ", exactDomains);
  var regexDomains = await query(gravity, "SELECT id, domain, group_id FROM domainlist, domainlist_by_group WHERE id = domainlist_id AND type = 3");
  console.log("Regex domains: ", regexDomains);
  // Find all the domains in the query log that were allowed through the filter
  var queriesInLastDay = await query(ftl, "SELECT timestamp, domain FROM queries WHERE timestamp > (?) AND status IN (2, 3) ORDER BY timestamp ASC", fiveAM());
  console.log("Queries today: ", queriesInLastDay.length);
  
  var domainMatches = getDomainMatches(exactDomains, regexDomains, queriesInLastDay);

  var groupTimes = getTimesPerGroup(domainMatches);
	
  console.log("Matches:", domainMatches);

  res.render('main', {
    layout: false,
    groups: groups,
    domainMatches: domainMatches,
    groupTimes: groupTimes
  });
});

app.listen(1234)

console.log("Server running")
