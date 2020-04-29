var albumBucketName = "photosalbums";
var bucketRegion = "us-east-1";
var IdentityPoolId = "us-east-1:87cc1369-5a60-4a94-b544-2ab0e14bc723";
var isStart = true;

const audioUtils        = require(['./audioUtils']);  // for encoding audio data as PCM
// const crypto            = require(['crypto']); // tot sign our pre-signed URL
const v4                = require(['./aws-signature-v4']); // to generate our pre-signed URL
const marshaller        = require("@aws-sdk/eventstream-marshaller"); // for converting binary event stream messages to and from JSON
const util_utf8_node    = require("@aws-sdk/util-utf8-node"); // utilities for encoding and decoding UTF8
const mic               = require('microphone-stream'); // collect microphone input as a stream of raw bytes
let languageCode = "en-US";
let region = "us-east-1";
let sampleRate = 44100;
let inputSampleRate;
let transcription = "";
let socket;
let micStream;
let socketError = false;
let transcribeException = false;
// our converter between binary event streams messages and JSON
const eventStreamMarshaller = new marshaller.EventStreamMarshaller(util_utf8_node.toUtf8, util_utf8_node.fromUtf8);

// var apigClient = apigClientFactory.newClient({
//   apiKey: 'vnb2A71rOd2ox3ksFAwW222nsKNfovpM1fiZBD4h'
// });
var apigClient = apigClientFactory.newClient();
var search = function() {
  if (true) {
    var query = $("#search_query").val();
    var params = {
      "q": query
    };
    
    apigClient.searchGet(params)
        .then(function(result){
            console.log(result);
            // alert("Hello, thank you for using smart door authentication system! An OTP " + result.data.body.messages[0].unstructed['OTP'] + " has been sent to the visitor " + vname + ".")
            $("#result").empty()

            // var img = $("<img src='https://inventionland.com/wp-content/uploads/2015/09/National_Thank_You_Day.png' width='250px' height='100%'>")
            // $(".borde").append(img)
            var num = result.data['results'].length
            if (num == 0 || num == 1) {
              var count = $("<div>")
              $(count).text("There is " + num.toString() + " result.")
              $("#result").append(count)
            } else {
              var count = $("<div>")
              $(count).text("There are " + num.toString() + " results.")
              $("#result").append(count)
            }
            for (var i = 0; i < num; i++) {
              var res = $("<img src='"+result.data['results'][i]['url'] + "'>")
            $("#result").append(res)
            }
            
            // Add success callback code here.
        }).catch( function(result){
            // Add error callback code here.
            alert("Error")
            console.log(result);
        });
  }

}

AWS.config.update({
  region: bucketRegion,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
  })
});

var s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  params: { Bucket: albumBucketName }
});

function listAlbums() {
  s3.listObjects({ Delimiter: "/" }, function(err, data) {
    if (err) {
      return alert("There was an error listing your albums: " + err.message);
    } else {
      var albums = data.CommonPrefixes.map(function(commonPrefix) {
        var prefix = commonPrefix.Prefix;
        var albumName = decodeURIComponent(prefix.replace("/", ""));
        return getHtml([
          "<li>",
          "<span onclick=\"deleteAlbum('" + albumName + "')\">X</span>",
          "<span onclick=\"viewAlbum('" + albumName + "')\">",
          albumName,
          "</span>",
          "</li>"
        ]);
      });
      var message = albums.length
        ? getHtml([
            "<p>Click on an album name to view it.</p>",
            "<p>Click on the X to delete the album.</p>"
          ])
        : "<p>You do not have any albums. Please Create album.";
      var htmlTemplate = [
        "<h2>Albums</h2>",
        message,
        "<ul>",
        getHtml(albums),
        "</ul>",
        "<button onclick=\"createAlbum(prompt('Enter Album Name:'))\">",
        "Create New Album",
        "</button>"
      ];
      document.getElementById("app").innerHTML = getHtml(htmlTemplate);
    }
  });
}

function createAlbum(albumName) {
  albumName = albumName.trim();
  if (!albumName) {
    return alert("Album names must contain at least one non-space character.");
  }
  if (albumName.indexOf("/") !== -1) {
    return alert("Album names cannot contain slashes.");
  }
  var albumKey = encodeURIComponent(albumName) + "/";
  s3.headObject({ Key: albumKey }, function(err, data) {
    if (!err) {
      return alert("Album already exists.");
    }
    if (err.code !== "NotFound") {
      return alert("There was an error creating your album: " + err.message);
    }
    s3.putObject({ Key: albumKey }, function(err, data) {
      if (err) {
        return alert("There was an error creating your album: " + err.message);
      }
      alert("Successfully created album.");
      viewAlbum(albumName);
    });
  });
}

function viewAlbum(albumName) {
  var albumPhotosKey = encodeURIComponent(albumName) + "//";
  s3.listObjects({ Prefix: albumPhotosKey }, function(err, data) {
    if (err) {
      return alert("There was an error viewing your album: " + err.message);
    }
    // 'this' references the AWS.Response instance that represents the response
    var href = this.request.httpRequest.endpoint.href;
    var bucketUrl = href + albumBucketName + "/";

    var photos = data.Contents.map(function(photo) {
      var photoKey = photo.Key;
      var photoUrl = bucketUrl + encodeURIComponent(photoKey);
      return getHtml([
        "<span>",
        "<div>",
        '<img style="width:128px;height:128px;" src="' + photoUrl + '"/>',
        "</div>",
        "<div>",
        "<span onclick=\"deletePhoto('" +
          albumName +
          "','" +
          photoKey +
          "')\">",
        "X",
        "</span>",
        "<span>",
        photoKey.replace(albumPhotosKey, ""),
        "</span>",
        "</div>",
        "</span>"
      ]);
    });
    var message = photos.length
      ? "<p>Click on the X to delete the photo</p>"
      : "<p>You do not have any photos in this album. Please add photos.</p>";
    var htmlTemplate = [
      "<h2>",
      "Album: " + albumName,
      "</h2>",
      message,
      "<div>",
      getHtml(photos),
      "</div>",
      '<input id="photoupload" type="file" accept="image/*">',
      '<button id="addphoto" onclick="addPhoto(\'' + albumName + "')\">",
      "Add Photo",
      "</button>",
      '<button onclick="listAlbums()">',
      "Back To Albums",
      "</button>"
    ];
    document.getElementById("app").innerHTML = getHtml(htmlTemplate);
  });
}

function addPhoto(albumName) {
  var files = document.getElementById("photoupload").files;
  if (!files.length) {
    return alert("Please choose a file to upload first.");
  }
  var file = files[0];
  var fileName = file.name;
  var albumPhotosKey = encodeURIComponent(albumName) + "//";

  var photoKey = albumPhotosKey + fileName;
  // Use S3 ManagedUpload class as it supports multipart uploads
  var upload = new AWS.S3.ManagedUpload({
    params: {
      Bucket: albumBucketName,
      Key: photoKey,
      Body: file,
      ACL: "public-read"
    }
  });

  var promise = upload.promise();

  promise.then(
    function(data) {
      alert("Successfully uploaded photo.");
      viewAlbum(albumName);
    },
    function(err) {
      return alert("There was an error uploading your photo: ", err.message);
    }
  );
}

function deletePhoto(albumName, photoKey) {
  s3.deleteObject({ Key: photoKey }, function(err, data) {
    if (err) {
      return alert("There was an error deleting your photo: ", err.message);
    }
    alert("Successfully deleted photo.");
    viewAlbum(albumName);
  });
}

function deleteAlbum(albumName) {
  var albumKey = encodeURIComponent(albumName) + "/";
  s3.listObjects({ Prefix: albumKey }, function(err, data) {
    if (err) {
      return alert("There was an error deleting your album: ", err.message);
    }
    var objects = data.Contents.map(function(object) {
      return { Key: object.Key };
    });
    s3.deleteObjects(
      {
        Delete: { Objects: objects, Quiet: true }
      },
      function(err, data) {
        if (err) {
          return alert("There was an error deleting your album: ", err.message);
        }
        alert("Successfully deleted album.");
        listAlbums();
      }
    );
  });
}


// enable amazon transcribe
let streamAudioToWebSocket = function (userMediaStream) {
  micStream = new mic();

  micStream.on("format", function(data) {
      inputSampleRate = data.sampleRate;
  });

  micStream.setStream(userMediaStream);
  
  let url = createPresignedUrl();

  socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  let sampleRate = 0;

  socket.onopen = function() {
      micStream.on('data', function(rawAudioChunk) {
          let binary = convertAudioToBinaryMessage(rawAudioChunk);

          if (socket.readyState === socket.OPEN)
              socket.send(binary);
      }
  )};

  wireSocketEvents();
}

function createPresignedUrl() {
  let endpoint = "transcribestreaming." + region + ".amazonaws.com:8443";

  // get a preauthenticated URL that we can use to establish our WebSocket
  return v4.createPresignedURL(
      'GET',
      endpoint,
      '/stream-transcription-websocket',
      'transcribe',
      crypto.createHash('sha256').update('', 'utf8').digest('hex'), {
          'key': 'AKIAYF54BHM7MZGHY3WY',
          'secret': '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',
          // 'sessionToken': $('#session_token').val(),
          'protocol': 'wss',
          'expires': 15,
          'region': region,
          'query': "language-code=" + languageCode + "&media-encoding=pcm&sample-rate=" + sampleRate
      }
  );
}

function toggleStartStop() {
  if (isStart) {
    $("#voice").removeClass("start");
    $("#voice").addClass("stop");

    window.navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true
  })
  .then(streamAudioToWebSocket) 
  .catch(function (error) {
      showError('There was an error streaming your audio to Amazon Transcribe. Please try again.');
      // toggleStartStop();
  });
    isStart = false

  } else {
    $("#voice").removeClass("stop");
    $("#voice").addClass("start");
    closeSocket();
    isStart = true
  }
}

function convertAudioToBinaryMessage(audioChunk) {
  let raw = mic.toRaw(audioChunk);

  if (raw == null)
      return;

  // downsample and convert the raw audio bytes to PCM
  let downsampledBuffer = audioUtils.downsampleBuffer(raw, inputSampleRate, sampleRate);
  let pcmEncodedBuffer = audioUtils.pcmEncode(downsampledBuffer);

  // add the right JSON headers and structure to the message
  let audioEventMessage = getAudioEventMessage(Buffer.from(pcmEncodedBuffer));

  //convert the JSON object + headers into a binary event stream message
  let binary = eventStreamMarshaller.marshall(audioEventMessage);

  return binary;
}

function getAudioEventMessage(buffer) {
  // wrap the audio data in a JSON envelope
  return {
      headers: {
          ':message-type': {
              type: 'string',
              value: 'event'
          },
          ':event-type': {
              type: 'string',
              value: 'AudioEvent'
          }
      },
      body: buffer
  };
}

function wireSocketEvents() {
  // handle inbound messages from Amazon Transcribe
  socket.onmessage = function (message) {
      //convert the binary event stream message to JSON
      let messageWrapper = eventStreamMarshaller.unmarshall(Buffer(message.data));
      let messageBody = JSON.parse(String.fromCharCode.apply(String, messageWrapper.body));
      if (messageWrapper.headers[":message-type"].value === "event") {
          handleEventStreamMessage(messageBody);
      }
      else {
          transcribeException = true;
          // showError(messageBody.Message);
          // toggleStartStop();
      }
  };


  socket.onerror = function () {
      socketError = true;
      showError('WebSocket connection error. Try again.');
      toggleStartStop();
  };
  
  socket.onclose = function (closeEvent) {
      micStream.stop();
      
      // the close event immediately follows the error event; only handle one.
      if (!socketError && !transcribeException) {
          if (closeEvent.code != 1000) {
              showError('</i><strong>Streaming Exception</strong><br>' + closeEvent.reason);
          }
          toggleStartStop();
      }
  };
}

let closeSocket = function () {
  if (socket.readyState === socket.OPEN) {
      micStream.stop();

      // Send an empty frame so that Transcribe initiates a closure of the WebSocket after submitting all transcripts
      let emptyMessage = getAudioEventMessage(Buffer.from(new Buffer([])));
      let emptyBuffer = eventStreamMarshaller.marshall(emptyMessage);
      socket.send(emptyBuffer);
  }
}

let handleEventStreamMessage = function (messageJson) {
  let results = messageJson.Transcript.Results;

  if (results.length > 0) {
      if (results[0].Alternatives.length > 0) {
          let transcript = results[0].Alternatives[0].Transcript;

          // fix encoding for accented characters
          transcript = decodeURIComponent(escape(transcript));

          // update the textarea with the latest result
          $('#search_query').val(transcription + transcript + "\n");

          // if this transcript segment is final, add it to the overall transcription
          if (!results[0].IsPartial) {
              //scroll the textarea down
              $('#search_query').scrollTop($('#search_query')[0].scrollHeight);

              transcription += transcript + "\n";
          }
      }
  }
}

$(document).ready(function(){
  $("#submit").click(function(){
    search()
  })
  $(".micro").click(function(){
    toggleStartStop()
  })
})