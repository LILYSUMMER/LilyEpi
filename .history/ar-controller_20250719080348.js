/**
 * Advanced AR Controller for 서귀포의 환상
 * A-Frame WebXR Components and Utilities
 */

// A-Frame Component: Advanced Plane Detection
AFRAME.registerComponent('ar-plane-detector', {
    schema: {
        interval: { type: 'number', default: 100 },
        maxDistance: { type: 'number', default: 5 },
        debug: { type: 'boolean', default: false }
    },
    
    init: function() {
        this.planes = new Map();
        this.lastCheck = 0;
        this.isDetecting = false;
        
        // Hit test source
        this.hitTestSource = null;
        this.hitTestSourceRequested = false;
        
        console.log('[AR-Controller] Plane detector initialized');
    },
    
    tick: function(time) {
        if (!this.el.sceneEl.is('ar-mode')) return;
        if (time - this.lastCheck < this.data.interval) return;
        
        this.lastCheck = time;
        this.detectPlanes();
    },
    
    detectPlanes: function() {
        const frame = this.el.sceneEl.frame;
        if (!frame) return;
        
        // Hit test for plane detection
        if (this.el.sceneEl.renderer.xr.isPresenting) {
            const session = this.el.sceneEl.renderer.xr.getSession();
            
            if (!this.hitTestSourceRequested) {
                session.requestReferenceSpace('viewer').then((referenceSpace) => {
                    session.requestHitTestSource({ space: referenceSpace }).then((source) => {
                        this.hitTestSource = source;
                        console.log('[AR-Controller] Hit test source created');
                    });
                });
                this.hitTestSourceRequested = true;
            }
            
            if (this.hitTestSource) {
                const hitTestResults = frame.getHitTestResults(this.hitTestSource);
                if (hitTestResults.length > 0) {
                    this.el.emit('plane-detected', {
                        results: hitTestResults,
                        pose: hitTestResults[0].getPose(this.el.sceneEl.renderer.xr.getReferenceSpace())
                    });
                }
            }
        }
    }
});

// A-Frame Component: Smart Video Placement
AFRAME.registerComponent('smart-video-placer', {
    schema: {
        target: { type: 'selector' },
        autoPlace: { type: 'boolean', default: true },
        autoPlaceDelay: { type: 'number', default: 3000 },
        size: { type: 'vec2', default: { x: 1.778, y: 1 } },
        distance: { type: 'number', default: 2 }
    },
    
    init: function() {
        this.placed = false;
        this.videoEl = this.data.target;
        
        // Listen for plane detection
        this.el.addEventListener('plane-detected', this.onPlaneDetected.bind(this));
        
        // Listen for click events
        this.el.addEventListener('click', this.onTap.bind(this));
        
        // Auto placement timer
        if (this.data.autoPlace) {
            setTimeout(() => {
                if (!this.placed && this.el.sceneEl.is('ar-mode')) {
                    this.autoPlaceVideo();
                }
            }, this.data.autoPlaceDelay);
        }
        
        console.log('[AR-Controller] Smart video placer initialized');
    },
    
    onPlaneDetected: function(event) {
        if (this.placed) return;
        
        const pose = event.detail.pose;
        this.placeVideoAtPose(pose);
    },
    
    onTap: function(event) {
        if (this.placed) return;
        if (!this.el.sceneEl.is('ar-mode')) return;
        
        // Get camera position and place video in front
        const camera = this.el.sceneEl.camera;
        const cameraPos = camera.getAttribute('position');
        const cameraRot = camera.getAttribute('rotation');
        
        // Calculate position in front of camera
        const distance = this.data.distance;
        const radY = THREE.MathUtils.degToRad(cameraRot.y);
        
        const position = {
            x: cameraPos.x - Math.sin(radY) * distance,
            y: cameraPos.y - 0.3,
            z: cameraPos.z - Math.cos(radY) * distance
        };
        
        this.placeVideoAtPosition(position);
    },
    
    placeVideoAtPose: function(pose) {
        if (!this.videoEl) return;
        
        const position = {
            x: pose.transform.position.x,
            y: pose.transform.position.y + this.data.size.y / 2,
            z: pose.transform.position.z
        };
        
        this.placeVideoAtPosition(position);
    },
    
    placeVideoAtPosition: function(position) {
        if (!this.videoEl || this.placed) return;
        
        // Set video position and make visible
        this.videoEl.setAttribute('position', position);
        this.videoEl.setAttribute('visible', true);
        
        // Face the camera
        this.videoEl.setAttribute('look-at', '[camera]');
        
        // Add placement animation
        this.animateIn();
        
        this.placed = true;
        
        // Emit placed event
        this.el.emit('video-placed', { position });
        
        console.log('[AR-Controller] Video placed at:', position);
    },
    
    autoPlaceVideo: function() {
        console.log('[AR-Controller] Auto placing video');
        
        const camera = this.el.sceneEl.camera;
        const cameraPos = camera.getAttribute('position');
        
        const position = {
            x: cameraPos.x,
            y: Math.max(cameraPos.y - 0.5, 0.5),
            z: cameraPos.z - this.data.distance
        };
        
        this.placeVideoAtPosition(position);
    },
    
    animateIn: function() {
        if (!this.videoEl) return;
        
        // Scale animation
        this.videoEl.setAttribute('scale', '0.1 0.1 0.1');
        this.videoEl.setAttribute('animation', {
            property: 'scale',
            to: '1 1 1',
            dur: 800,
            easing: 'easeOutElastic'
        });
        
        // Opacity animation
        const material = this.videoEl.getAttribute('material');
        material.opacity = 0;
        this.videoEl.setAttribute('material', material);
        
        setTimeout(() => {
            this.videoEl.setAttribute('animation__opacity', {
                property: 'material.opacity',
                to: 1,
                dur: 500,
                easing: 'easeOutQuad'
            });
        }, 200);
    },
    
    reset: function() {
        if (this.videoEl) {
            this.videoEl.setAttribute('visible', false);
            this.videoEl.removeAttribute('animation');
            this.videoEl.removeAttribute('animation__opacity');
        }
        this.placed = false;
        console.log('[AR-Controller] Video placement reset');
    }
});

// A-Frame Component: Gesture Controls
AFRAME.registerComponent('gesture-controls', {
    schema: {
        enabled: { type: 'boolean', default: true },
        pinchThreshold: { type: 'number', default: 0.1 },
        rotationThreshold: { type: 'number', default: 15 }
    },
    
    init: function() {
        this.startDistance = 0;
        this.startRotation = 0;
        this.startScale = 1;
        this.isGesturing = false;
        
        // Touch events
        this.el.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.el.addEventListener('touchmove', this.onTouchMove.bind(this));
        this.el.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        console.log('[AR-Controller] Gesture controls initialized');
    },
    
    onTouchStart: function(event) {
        if (!this.data.enabled) return;
        if (event.touches.length === 2) {
            this.startGesture(event);
        }
    },
    
    onTouchMove: function(event) {
        if (!this.isGesturing) return;
        if (event.touches.length === 2) {
            this.updateGesture(event);
        }
    },
    
    onTouchEnd: function(event) {
        if (this.isGesturing) {
            this.endGesture();
        }
    },
    
    startGesture: function(event) {
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        
        this.startDistance = this.getDistance(touch1, touch2);
        this.startRotation = this.getRotation(touch1, touch2);
        this.startScale = this.el.getAttribute('scale').x;
        this.isGesturing = true;
        
        console.log('[AR-Controller] Gesture started');
    },
    
    updateGesture: function(event) {
        const touch1 = event.touches[0];
        const touch2 = event.touches[1];
        
        const currentDistance = this.getDistance(touch1, touch2);
        const currentRotation = this.getRotation(touch1, touch2);
        
        // Scale based on pinch
        const scaleRatio = currentDistance / this.startDistance;
        const newScale = Math.max(0.5, Math.min(3, this.startScale * scaleRatio));
        
        this.el.setAttribute('scale', {
            x: newScale,
            y: newScale,
            z: newScale
        });
        
        // Rotation based on twist
        const rotationDiff = currentRotation - this.startRotation;
        if (Math.abs(rotationDiff) > this.data.rotationThreshold) {
            const currentRotY = this.el.getAttribute('rotation').y;
            this.el.setAttribute('rotation', {
                x: 0,
                y: currentRotY + rotationDiff,
                z: 0
            });
            this.startRotation = currentRotation;
        }
    },
    
    endGesture: function() {
        this.isGesturing = false;
        console.log('[AR-Controller] Gesture ended');
    },
    
    getDistance: function(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    },
    
    getRotation: function(touch1, touch2) {
        const dx = touch1.clientX - touch2.clientX;
        const dy = touch1.clientY - touch2.clientY;
        return Math.atan2(dy, dx) * 180 / Math.PI;
    }
});

// A-Frame Component: Video Controller
AFRAME.registerComponent('video-controller', {
    schema: {
        videoId: { type: 'string', default: 'arVideo' },
        autoplay: { type: 'boolean', default: true },
        controls: { type: 'boolean', default: false }
    },
    
    init: function() {
        this.video = document.getElementById(this.data.videoId);
        this.isPlaying = false;
        
        if (this.video) {
            this.video.addEventListener('loadeddata', this.onVideoLoaded.bind(this));
            this.video.addEventListener('play', this.onVideoPlay.bind(this));
            this.video.addEventListener('pause', this.onVideoPause.bind(this));
            this.video.addEventListener('error', this.onVideoError.bind(this));
        }
        
        // Listen for control events
        this.el.addEventListener('toggle-video', this.togglePlayback.bind(this));
        this.el.addEventListener('video-placed', this.startVideo.bind(this));
        
        console.log('[AR-Controller] Video controller initialized');
    },
    
    onVideoLoaded: function() {
        console.log('[AR-Controller] Video loaded successfully');
        if (this.data.autoplay) {
            this.playVideo();
        }
    },
    
    onVideoPlay: function() {
        this.isPlaying = true;
        console.log('[AR-Controller] Video playback started');
    },
    
    onVideoPause: function() {
        this.isPlaying = false;
        console.log('[AR-Controller] Video playback paused');
    },
    
    onVideoError: function(error) {
        console.error('[AR-Controller] Video error:', error);
    },
    
    startVideo: function() {
        if (this.video && this.data.autoplay) {
            this.playVideo();
        }
    },
    
    playVideo: function() {
        if (this.video) {
            const playPromise = this.video.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.warn('[AR-Controller] Video autoplay prevented:', error);
                });
            }
        }
    },
    
    pauseVideo: function() {
        if (this.video) {
            this.video.pause();
        }
    },
    
    togglePlayback: function() {
        if (this.video) {
            if (this.isPlaying) {
                this.pauseVideo();
            } else {
                this.playVideo();
            }
        }
    }
});

// A-Frame Component: Performance Monitor
AFRAME.registerComponent('performance-monitor', {
    schema: {
        enabled: { type: 'boolean', default: true },
        interval: { type: 'number', default: 1000 }
    },
    
    init: function() {
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        
        if (this.data.enabled) {
            setInterval(this.updateStats.bind(this), this.data.interval);
        }
        
        console.log('[AR-Controller] Performance monitor initialized');
    },
    
    tick: function() {
        this.frameCount++;
    },
    
    updateStats: function() {
        const currentTime = performance.now();
        const deltaTime = currentTime - this.lastTime;
        
        this.fps = Math.round((this.frameCount * 1000) / deltaTime);
        this.frameCount = 0;
        this.lastTime = currentTime;
        
        // Emit performance data
        this.el.emit('performance-update', {
            fps: this.fps,
            memory: this.getMemoryUsage()
        });
        
        if (this.fps < 20) {
            console.warn('[AR-Controller] Low FPS detected:', this.fps);
        }
    },
    
    getMemoryUsage: function() {
        if (performance.memory) {
            return {
                used: Math.round(performance.memory.usedJSHeapSize / 1048576),
                total: Math.round(performance.memory.totalJSHeapSize / 1048576),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576)
            };
        }
        return null;
    }
});

// Utility Functions
const ARUtils = {
    // Device Detection
    isMobile: function() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    },
    
    isIOS: function() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent);
    },
    
    isAndroid: function() {
        return /Android/.test(navigator.userAgent);
    },
    
    // WebXR Support Detection
    checkWebXRSupport: async function() {
        if (!navigator.xr) {
            return { supported: false, reason: 'WebXR not available' };
        }
        
        try {
            const arSupported = await navigator.xr.isSessionSupported('immersive-ar');
            return {
                supported: arSupported,
                reason: arSupported ? 'WebXR AR supported' : 'WebXR AR not supported'
            };
        } catch (error) {
            return { supported: false, reason: error.message };
        }
    },
    
    // Screen Wake Lock
    requestWakeLock: async function() {
        if ('wakeLock' in navigator) {
            try {
                const wakeLock = await navigator.wakeLock.request('screen');
                console.log('[AR-Controller] Screen wake lock acquired');
                return wakeLock;
            } catch (error) {
                console.warn('[AR-Controller] Wake lock failed:', error);
            }
        }
        return null;
    },
    
    // Haptic Feedback
    vibrate: function(pattern = 50) {
        if ('vibrate' in navigator) {
            navigator.vibrate(pattern);
        }
    },
    
    // Orientation Lock
    lockOrientation: function(orientation = 'portrait') {
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock(orientation).catch(error => {
                console.warn('[AR-Controller] Orientation lock failed:', error);
            });
        }
    },
    
    // Calculate optimal video size based on screen
    calculateVideoSize: function(aspectRatio = 16/9, maxSize = 2) {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        const screenAspect = screenWidth / screenHeight;
        
        let width, height;
        
        if (screenAspect > aspectRatio) {
            // Screen is wider than video
            height = Math.min(maxSize, screenHeight / 1000);
            width = height * aspectRatio;
        } else {
            // Screen is taller than video
            width = Math.min(maxSize, screenWidth / 1000);
            height = width / aspectRatio;
        }
        
        return { width, height };
    }
};

// Global AR Controller State
window.ARController = {
    initialized: false,
    wakeLock: null,
    
    init: function() {
        if (this.initialized) return;
        
        console.log('[AR-Controller] Initializing global controller');
        
        // Request wake lock for mobile devices
        if (ARUtils.isMobile()) {
            ARUtils.requestWakeLock().then(wakeLock => {
                this.wakeLock = wakeLock;
            });
        }
        
        // Lock orientation on mobile
        if (ARUtils.isMobile()) {
            ARUtils.lockOrientation('portrait');
        }
        
        this.initialized = true;
        console.log('[AR-Controller] Global controller initialized');
    },
    
    cleanup: function() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
        }
        
        console.log('[AR-Controller] Cleanup completed');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('[AR-Controller] DOM loaded, initializing...');
    
    // Wait for A-Frame to be ready
    if (typeof AFRAME !== 'undefined') {
        ARController.init();
    } else {
        // Wait for A-Frame
        const checkAFrame = setInterval(() => {
            if (typeof AFRAME !== 'undefined') {
                clearInterval(checkAFrame);
                ARController.init();
            }
        }, 100);
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    ARController.cleanup();
});

console.log('[AR-Controller] Advanced AR Controller loaded successfully'); 