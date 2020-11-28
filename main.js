const express = require('express')
const exhbs = require('express-handlebars')
const app = express()

app.engine('handlebars', exhbs());

app.set('view engine', 'handlebars');

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('/etc/pihole/gravity.db');

function query(q) {
  return new Promise(function(resolve, reject) {
    db.all(q, function(err, rows) {
      console.log("Got rows:", rows);
      resolve(rows);
    });
  })
}

app.get('/', async function (req, res) {

  var rows = await query("SELECT name FROM \"group\"");
  const groups = rows.map((row) => { return row['name'] });

  res.render('main', {
    layout: false,
    groups: groups
  });
});

app.listen(1234)

console.log("Server running")
