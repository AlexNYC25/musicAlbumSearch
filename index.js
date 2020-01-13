// Created By Alexis Montes

// libraries used in js
const http = require('http');
const fs = require('fs');
const url = require('url');
const https = require('https');
const querystring = require('querystring');

// initial cached auth var
let cached_auth = null;

// user credentials
const credentials = require('./auth/credentials.json');

// location of authentication result
const authentication_cache = './auth/authentication-res.json';

// url of spotify token
const token_endpoint = 'https://accounts.spotify.com/api/token';

// Date object to generate get time
let auth_sent_time = new Date();

// post data object with user credentials
let post_data = {
    "client_id":credentials.client_id,
    "client_secret":credentials.client_secret,
    "grant_type":"client_credentials"
}

// string query version of post data object
let stringPD = querystring.stringify(post_data);

// options object for request 
let options = {
	"method": "POST",
	"headers": {
		"Content-Type": "application/x-www-form-urlencoded",
		"Content-Length": stringPD.length
	}
}


let base = {
    requests:{}
}
let formatedBase = JSON.stringify(base)
fs.writeFile('./auth/history.json', formatedBase, (err) => {
    console.log(err);
});

// Sets up initial token
let authentication_req = https.request(token_endpoint, options, function(authentication_res) {
    console.log(`creating a new access token`)
    received_authentication(authentication_res, "user_input", auth_sent_time, "res");
});
authentication_req.on('error', function (e) {console.error(e);});
authentication_req.end(stringPD)


// processes authentication request to and creates a spotify token object
const received_authentication = function(authentication_res, user_input, auth_sent_time, res){
    authentication_res.setEncoding("utf8");
    let body = "";
    authentication_res.on("data", function(chunk) {body += chunk;});
    authentication_res.on("end", function(){
        let spotify_auth = JSON.parse(body);
        // creates object property with expiration time in milliseconds
        spotify_auth.expiration = auth_sent_time.getTime() + (3600 * 1000)
        create_access_token_cache(spotify_auth)
    });
}

// writes string object of spotify token data to json file
const create_access_token_cache = function(spotify_auth){
    tempStr = JSON.stringify(spotify_auth)
    fs.writeFile('./auth/authentication-res.json', tempStr, (err) => {
        console.log(err);
    });
}

const server = http.createServer((req, res) => {
    if(req.url === "/"){
        
        let home = fs.createReadStream("./html/search-form.html");
        res.writeHead(200, {'Content-Type':'text/html'});
        home.pipe(res);
    }
    if(req.url.startsWith("/favicon.ico")){
        res.writeHead(404);
        res.end();
    }
    if(req.url.startsWith("/album-art/")){
        let dirStart = "."
        let image = fs.createReadStream(dirStart.concat(req.url.valueOf()));
        image.on("error", () => {
            res.writeHead(404);
            res.end();
        })
        res.writeHead(200, {'Content-Type':'image/jpeg'});
        image.pipe(res)
    }
    if(req.url.startsWith("/search")){
        // q = the string search query
        let q = url.parse(req.url.valueOf(), parseQueryString=true).query.q;

        if(fs.existsSync('./auth/history.json')){
            const history = require('./auth/history.json')
            // check expiration date
            // if expiration date still valid
                try{
                    let codetext = history.requests[q].htmlText
                    if (parseInt(history.requests[q].expiration) > auth_sent_time.getTime()){
                        //console.log("not expired")
                        res.end(codetext)
                    }
                }
                catch(error){
                    //console.log("not in history yet")
                }

            }
        // creates json file if it dosent exist yet
        else{
            let base = {
                requests:{}
            }
            let formatedBase = JSON.stringify(base)
            fs.writeFile('./auth/history.json', formatedBase, (err) => {
                console.log(err);
            });
        }

        let cache_valid = false;

        // handling if the authentication cache is not already created
        if(fs.existsSync(authentication_cache)) {
            cached_auth = require(authentication_cache);
            if (new Date(cached_auth.expiration) > Date.now()) {
                cache_valid = true;
            }
            else{
                // let cache be false
            }
        }

        // 
        if (cache_valid) {
            // code to create website
            const spotifyAPI = "https://api.spotify.com/v1/search";
            const requestObjectType = "album";
            let tempToken = cached_auth.access_token;
            let dir = './album-art/'
            let fileNames = [];

            // formats object into string
            let queryUrlString = querystring.stringify({type: requestObjectType, q: q, access_token: tempToken});
            // concats string into full url with api url
            let requestURL = spotifyAPI.concat("?", queryUrlString)

            // 
            const apiRequestResult = https.request(requestURL, (res) => {
                // process res object into body
                let body = ""
                res.on('data', (chunk) => {
                    body += chunk;
                })

                res.on('end', function() {
                    console.log(`downloading album json`)
                    // keep count of images downloaded
                    let downloadedImages = 0;
                    // creates json object of processed data
                    let albumInfo = JSON.parse(body);

                    // sets up number of album images to be downloaded
                    let tempNum = albumInfo.albums.total;
                    let totalNumAlbums = 20;

                    if(tempNum < 20){
                        totalNumAlbums = tempNum
                    }

                    for (let x = 0; x < totalNumAlbums; x++){
                        let url = albumInfo.albums.items[x].images[0].url;
                        nameOfImg = new URL(albumInfo.albums.items[x].images[0].url).pathname.split('/').pop();
                        // adds new local url of image into fileNames array
                        let fullFileName = dir.concat( nameOfImg, '.jpeg')
                        fileNames.push(fullFileName)

                        // fs.access() to check if file is already in folder
                        fs.access(fullFileName, fs.F_OK, (err) => {
                            if(err){
                                // file dosen't exist yet
                                let image_req = https.get(url, function(image_res){
                                    let new_img = fs.createWriteStream(fullFileName,{'encoding':null});
                                    image_res.pipe(new_img);
                                    new_img.on("finish", function() {
                                        console.log(`image was downloaded`)
                                        downloadedImages++;
                                        // checks to see if the right amount of files are downloaded
                                        if(downloadedImages === totalNumAlbums){
                                            // generate_webpage( , res)
                                            generate_webpage()
                                        }
                                    })
                                })
        
                                image_req.on('error', function(err){
                                    console.log(err);
                                })
        
                                image_req.end();
                            }
                            else{
                                // file already exists
                                downloadedImages++;
                                if(downloadedImages === totalNumAlbums){
                                // generate_webpage( , res)
                                    generate_webpage()
                                }
                            }
                        })

                    }

                })
            })


            const generate_webpage = function(){
                // variable holding <h1> tags
                let header = `<h1> Search results for ${q} </h1> <br>`
                // uses map function to place location in tags
                let formatedResults = fileNames.map(function(x){
                    return `<img src='${x}' ></img>`
                })

                // loads up local history json
                const history = require('./auth/history.json')

                // creates values to be saved
                let htmlcode = header.concat(formatedResults.join(''))
                let dayTime = Math.pow(10, 7);
                let tempExp = 8.64 * dayTime;
                let finalExp = auth_sent_time.getTime() + tempExp;

                // creaates json object and loads created values
                let te = {
                    'htmlText':htmlcode,
                    'expiration':finalExp.toString()
            
                }

                // sets the created object to the query
                history.requests[q] = te

                // overwrites the current history json with the new updated one
                fs.writeFile('./auth/history.json', JSON.stringify(history), (err) => {
                    console.log(err);
                });

                // renders web page
                res.end(htmlcode)
            }

            apiRequestResult.on('error', (e) => {
                console.log(e);
            })

            apiRequestResult.end();

            //res.end("HELLO WORLD")
            //console.log(create_search_req(cached_auth, q, res));

        }
        else {
            // request access token when expires
            const token_endpoint = 'https://accounts.spotify.com/api/token';
            let auth_sent_time = new Date();
            let authentication_req = https.request(token_endpoint, options, function(authentication_res) {
                console.log(`creating a new access token`)
                received_authentication(authentication_res, "user_input", auth_sent_time, "res");
            });
            authentication_req.on('error', function (e) {console.error(e);});
            authentication_req.end(stringPD)
        }

 
    }
});

server.listen(3000);