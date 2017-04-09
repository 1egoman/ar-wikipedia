// Globals for storing data to render
let points, info, angles, distances, positionsOfLandmarks;

// Render three.js things!
let camera, controls, scene, renderer, geometry;

// Store all 3d things that are rendered to the canvas at any given time so we can easily clear the
// screen.
let alreadyRendered = [];

let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();

function geoUpdated({coords: {latitude, longitude}}) {
  console.log(latitude, longitude);
  localStorage.geo = JSON.stringify({latitude, longitude});

  fetch(`https://cors-anywhere.herokuapp.com/en.wikipedia.org/w/api.php?action=query&list=geosearch&gsradius=10000&gscoord=${latitude}|${longitude}&format=json`).then(resp => {
    return resp.json();
  }).then(json => {
    // Get all geolocations
    points = json.query.geosearch;

    // Fetch urls for each point
    const ids = points.map(i => i.pageid).join('|');
    return fetch(`https://cors-anywhere.herokuapp.com/en.wikipedia.org/w/api.php?action=query&prop=info&pageids=${ids}&inprop=url&format=json`);
  }).then(resp => {
    return resp.json();
  }).then(json => {
    info = json.query.pages;
    console.log(info)

    // Get distances from current position to the landmark
    return points.map(point => {
      return haversine({latitude, longitude}, {latitude: point.lat, longitude: point.lon}, {unit: 'meter'});
    });
  }).then(pos => {
    distances = pos;
    return points.map(p => {
      return Math.atan((longitude - p.lon) / (latitude - p.lat));
    });
  }).then(a => {
    angles = a;

    return angles.map((deg, ct) => {
      // return {x: distances[ct] * Math.sin(deg), y: distances[ct] * Math.cos(deg)};
      return {x: distances[ct] * Math.cos(deg), y: distances[ct] * Math.sin(deg)};
    });
  }).then(pos => {
    positionsOfLandmarks = pos;
    // Remove loading indicator
    var loading = document.getElementById("loading");
    loading && loading.remove();

    renderLandmarks(positionsOfLandmarks);
    animate();
  });
};

function renderLandmarks(positionsOfLandmarks) {
  alreadyRendered.forEach(i => scene.remove(i));
  alreadyRendered = [];

  positionsOfLandmarks.forEach(({x, y}, ct) => {
    var mesh = new THREE.Mesh( geometry, material );
    mesh.position.x = x;
    mesh.position.y = 0;
    mesh.position.z = y;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    alreadyRendered.push(mesh);

    var spritey = makeTextSprite(points[ct].title, {
      fontsize: 16,
      borderColor: {r:255, g:0, b:0, a:0},
      backgroundColor: {r: 255, g: 100, b: 255, a: 1.0}
    });
    spritey.position.set(x, 0, y);
    scene.add( spritey );
    alreadyRendered.push(spritey);
  });
}

function animate() {
  requestAnimationFrame( animate );
  controls.update(); // required if controls.enableDamping = true, or if controls.autoRotate = true
  render();
}

function render() {
  renderer.render( scene, camera );
}


function run() {
  // When geolocation updates...
  navigator.geolocation.watchPosition(geoUpdated);

  // Optimistic updates.
  if (localStorage.geo) {
    geoUpdated({coords: JSON.parse(localStorage.geo)});
  }

  // Insert video into the background
  navigator.mediaDevices.enumerateDevices().then(devs => {
    // Prefer a back camera.
    const back = devs.find(i => i.label.indexOf('back') >= 0) ||
      devs.find(i => i.kind.indexOf('video') >= 0); // but fall back on the first device that broadcasts video

    return navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: {exact: back.deviceId},
      },
    });
  }).then(localMediaStream => {
    var video = document.querySelector('video');
    video.src = window.URL.createObjectURL(localMediaStream);
  });



  if (!Detector.webgl) Detector.addGetWebGLMessage();

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2( 0xcccccc, 0.002 );

  renderer = new THREE.WebGLRenderer({alpha: true});
  renderer.setClearColor( 0x000000, 0 ); // the default
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize(window.innerWidth, window.innerHeight);

  let container = document.getElementById( 'container' );
  container.appendChild( renderer.domElement );

  camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 1, 1000 );
  camera.position.x = 0;
  camera.position.y = 0;
  camera.position.z = 1;

  controls = new THREE.DeviceOrientationControls( camera );
  controls.enableZoom = false;

  // world
  geometry = new THREE.SphereGeometry(5, 32, 32);
  material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    shading: THREE.FlatShading
  });

  // lights
  light = new THREE.DirectionalLight(0xffffff);
  light.position.set(1, 1, 1);
  scene.add(light);

  light = new THREE.DirectionalLight(0x002288);
  light.position.set(-1, -1, -1);
  scene.add(light);

  light = new THREE.AmbientLight(0x222222);
  scene.add(light);



  // When the user rotates their device, rotate the canvas to offset in the other direction.
  window.addEventListener('orientationchange', () => {
    window.setTimeout(function() {
      document.body.style['MozTransform'] =
      document.body.style['MsTransform'] =
      document.body.style['WebkitTransform'] =
      document.body.style['OTransform'] =
      document.body.style['Transform'] =
      `rotate(${-window.orientation || 0}deg)`;
    }, 200);
  }, false);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize( window.innerWidth, window.innerHeight );
  }, false );

  // Click to open landmark in a new tab
  window.addEventListener('mousedown', event => {
    mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

    // update the picking ray with the camera and mouse position
    raycaster.setFromCamera( mouse, camera );

    // calculate objects intersecting the picking ray
    var intersects = raycaster.intersectObjects(scene.children);

    // Generate index for landmark
    const landmarkIndex = intersects.reduce((prev, i) => {
      if (prev >= 0) {
        return prev;
      } else {
        const pt = i.point;
        return positionsOfLandmarks.findIndex(i => {
          return i.x === pt.x && i.y === pt.z;
        });
      }
    }, -1);

    // Open landmark
    const landmark = info[points[landmarkIndex].pageid];
    window.open(landmark.fullurl);
  }, false);
}
