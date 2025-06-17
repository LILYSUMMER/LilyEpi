// AR 요소들의 상태를 관리하는 객체
const arElements = {
    artwork: {
        element: null,
        description: "이중섭의 '황소' 작품"
    },
    dolHareubang: {
        element: null,
        description: "제주의 상징, 돌하르방"
    },
    story: {
        element: null,
        description: "강정마을의 전설"
    }
};

// 다국어 텍스트
const i18n = {
    ko: {
        subtitle: "첫번째 에피소드 : 이중섭",
        start: "시작하기",
        nfc_instruction: "NFC 태그를 찍어주세요",
        permission_title: "권한 요청",
        permission_description: "AR 체험을 위해 다음 권한이 필요합니다:",
        camera_permission: "📷 카메라 - AR 콘텐츠 표시",
        motion_permission: "📱 동작 센서 - 기기 움직임 감지",
        allow_permissions: "권한 허용",
        ar_instruction: "휴대폰을 조작하여 AR 콘텐츠를 체험하세요",
        start_ar: "AR 시작하기",
        permission_granted: "권한이 허용되었습니다!",
        permission_denied: "권한이 거부되었습니다. AR 체험을 위해 권한을 허용해주세요.",
        camera_permission_denied: "카메라 권한이 필요합니다.",
        motion_permission_denied: "동작 센서 권한이 필요합니다."
    },
    en: {
        subtitle: "First Episode : Lee Jung-seop",
        start: "Start",
        nfc_instruction: "Please scan the NFC tag",
        permission_title: "Permission Request",
        permission_description: "The following permissions are required for AR experience:",
        camera_permission: "📷 Camera - Display AR content",
        motion_permission: "📱 Motion Sensor - Detect device movement",
        allow_permissions: "Allow Permissions",
        ar_instruction: "Move your phone to experience AR content",
        start_ar: "Start AR",
        permission_granted: "Permissions granted!",
        permission_denied: "Permissions denied. Please allow permissions for AR experience.",
        camera_permission_denied: "Camera permission is required.",
        motion_permission_denied: "Motion sensor permission is required."
    },
    ja: {
        subtitle: "第一話：イ・ジュンソプ",
        start: "スタート",
        nfc_instruction: "NFCタグをスキャンしてください",
        permission_title: "権限リクエスト",
        permission_description: "AR体験には以下の権限が必要です：",
        camera_permission: "📷 カメラ - ARコンテンツ表示",
        motion_permission: "📱 モーションセンサー - デバイス動作検知",
        allow_permissions: "権限を許可",
        ar_instruction: "スマートフォンを動かしてARコンテンツを体験してください",
        start_ar: "AR開始",
        permission_granted: "権限が許可されました！",
        permission_denied: "権限が拒否されました。AR体験のために権限を許可してください。",
        camera_permission_denied: "カメラ権限が必要です。",
        motion_permission_denied: "モーションセンサー権限が必要です。"
    },
    zh: {
        subtitle: "第一集：李仲燮",
        start: "开始",
        nfc_instruction: "请扫描NFC标签",
        permission_title: "权限请求",
        permission_description: "AR体验需要以下权限：",
        camera_permission: "📷 相机 - 显示AR内容",
        motion_permission: "📱 动作传感器 - 检测设备移动",
        allow_permissions: "允许权限",
        ar_instruction: "移动手机体验AR内容",
        start_ar: "开始AR",
        permission_granted: "权限已授予！",
        permission_denied: "权限被拒绝。请允许权限以体验AR。",
        camera_permission_denied: "需要相机权限。",
        motion_permission_denied: "需要动作传感器权限。"
    }
};

// DOM 요소
const languageScreen = document.getElementById('language-screen');
const splashScreen = document.getElementById('splash-screen');
const nfcScreen = document.getElementById('nfc-screen');
const permissionScreen = document.getElementById('permission-screen');
const startScreen = document.getElementById('start-screen');
const arScene = document.getElementById('ar-scene');
const startExperienceButton = document.getElementById('start-experience');
const requestPermissionsButton = document.getElementById('request-permissions');
const startButton = document.getElementById('start-ar');
const artwork = document.getElementById('artwork');
const description = document.getElementById('description');

// 현재 선택된 언어
let currentLanguage = 'ko';

// 언어 변경 함수
function changeLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        const translation = i18n[lang][key];
        if (translation) {
            element.textContent = translation;
        }
    });
}

// 스플래시 화면으로 전환
function showSplashScreen() {
    languageScreen.classList.add('hidden');
    splashScreen.classList.remove('hidden');
}

// 시작 UI 표시
function showStartUI() {
    const startUI = document.getElementById('start-ui');
    startUI.classList.remove('hidden');
    setTimeout(() => {
        startUI.classList.add('visible');
    }, 100);
}

// 스플래시 화면에서 NFC 화면으로 전환
function startExperience() {
    splashScreen.classList.add('hidden');
    nfcScreen.classList.remove('hidden');
    initNFC();
}

// NFC 관련 기능
async function initNFC() {
    try {
        const ndef = new NDEFReader();
        await ndef.scan();
        
        ndef.addEventListener("reading", ({ message, serialNumber }) => {
            console.log(`NFC 태그 인식: ${serialNumber}`);
            showPermissionScreen();
        });

    } catch (error) {
        console.log("NFC 사용 불가:", error);
        // NFC를 사용할 수 없는 경우 바로 권한 화면으로 이동
        showPermissionScreen();
    }
}

// 권한 요청 화면 표시
function showPermissionScreen() {
    nfcScreen.classList.add('hidden');
    permissionScreen.classList.remove('hidden');
}

// 권한 요청 및 확인
async function requestPermissions() {
    try {
        // 카메라 권한 요청 (실제 카메라 스트림 요청)
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment', // 후면 카메라 우선
                width: { ideal: 1280 },
                height: { ideal: 960 }
            } 
        });
        
        // 카메라 스트림을 즉시 중지 (권한만 확인)
        stream.getTracks().forEach(track => track.stop());
        
        console.log('카메라 권한 허용됨');
        
        // 동작 센서 권한 확인 (iOS Safari의 경우)
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            try {
                const motionPermission = await DeviceOrientationEvent.requestPermission();
                if (motionPermission !== 'granted') {
                    showPermissionError(i18n[currentLanguage].motion_permission_denied);
                    return;
                }
            } catch (motionError) {
                console.log('동작 센서 권한 요청 실패:', motionError);
                // 동작 센서 권한이 없어도 계속 진행
            }
        }

        // 권한이 허용된 경우
        showPermissionSuccess();
        
    } catch (error) {
        console.error('권한 요청 오류:', error);
        
        if (error.name === 'NotAllowedError') {
            showPermissionError(i18n[currentLanguage].camera_permission_denied);
        } else if (error.name === 'NotFoundError') {
            showPermissionError('카메라를 찾을 수 없습니다. 카메라가 연결되어 있는지 확인해주세요.');
        } else if (error.name === 'NotSupportedError') {
            showPermissionError('이 브라우저는 카메라를 지원하지 않습니다.');
        } else {
            showPermissionError(i18n[currentLanguage].permission_denied);
        }
    }
}

// 권한 허용 성공 메시지
function showPermissionSuccess() {
    const message = i18n[currentLanguage].permission_granted;
    alert(message);
    showStartScreen();
}

// 권한 거부 오류 메시지
function showPermissionError(message) {
    alert(message);
}

// AR 시작 화면 표시
function showStartScreen() {
    permissionScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
}

// AR 시작
function startAR() {
    startScreen.classList.add('hidden');
    arScene.classList.remove('hidden');
    initAR();
    initCameraStream();
}

// 카메라 스트림 초기화
async function initCameraStream() {
    try {
        console.log('카메라 스트림 초기화 시작...');
        
        // AR.js가 카메라를 사용할 수 있도록 스트림 설정
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 960 }
            } 
        });
        
        console.log('카메라 스트림 성공:', stream);
        
        // AR.js에 스트림 전달 (필요한 경우)
        const arScene = document.getElementById('ar-scene');
        if (arScene && arScene.arjsSystem) {
            console.log('AR.js 시스템에 스트림 전달');
        }
        
    } catch (error) {
        console.error('카메라 스트림 초기화 실패:', error);
        alert('카메라를 초기화할 수 없습니다. 페이지를 새로고침하고 다시 시도해주세요.');
    }
}

// AR 초기화 및 모션 감지 설정
function initAR() {
    console.log('AR 초기화 시작...');
    
    // 디바이스 방향 감지 설정
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleOrientation);
        console.log('디바이스 방향 감지 설정 완료');
    } else {
        console.log('디바이스 방향 감지 지원 안됨');
    }

    // 디바이스 모션 감지 설정
    if (window.DeviceMotionEvent) {
        window.addEventListener('devicemotion', handleMotion);
        console.log('디바이스 모션 감지 설정 완료');
    } else {
        console.log('디바이스 모션 감지 지원 안됨');
    }
    
    // 표면 감지 설정
    setupSurfaceDetection();
    
    // AR 요소 확인
    setTimeout(() => {
        const artwork = document.getElementById('artwork');
        const description = document.getElementById('description');
        
        if (artwork) {
            console.log('AR 작품 요소 찾음:', artwork);
        } else {
            console.log('AR 작품 요소를 찾을 수 없음');
        }
        
        if (description) {
            console.log('AR 설명 요소 찾음:', description);
        } else {
            console.log('AR 설명 요소를 찾을 수 없음');
        }
    }, 1000);
}

// 표면 감지 설정
function setupSurfaceDetection() {
    const cursor = document.getElementById('cursor');
    const surfacePlane = document.getElementById('surface-plane');
    const artwork = document.getElementById('artwork');
    const description = document.getElementById('description');
    
    if (!cursor || !surfacePlane || !artwork || !description) {
        console.log('표면 감지 요소를 찾을 수 없음');
        return;
    }
    
    console.log('표면 감지 설정 시작...');
    
    // 표면 감지 이벤트
    cursor.addEventListener('raycaster-intersected', function(event) {
        console.log('표면 감지됨:', event.detail.intersection);
        const intersection = event.detail.intersection;
        
        // 감지된 표면 위치에 오브젝트 배치
        placeObjectOnSurface(intersection.point);
    });
    
    // 표면 감지 해제 이벤트
    cursor.addEventListener('raycaster-intersected-cleared', function(event) {
        console.log('표면 감지 해제됨');
    });
    
    // 클릭 이벤트 (표면에 오브젝트 배치)
    cursor.addEventListener('click', function(event) {
        console.log('표면 클릭됨');
        const raycaster = cursor.components.raycaster;
        if (raycaster.intersectedEls.length > 0) {
            const intersection = raycaster.intersections[0];
            placeObjectOnSurface(intersection.point);
        }
    });
}

// 표면에 오브젝트 배치
function placeObjectOnSurface(point) {
    const artwork = document.getElementById('artwork');
    const description = document.getElementById('description');
    
    if (!artwork || !description) {
        console.log('오브젝트 요소를 찾을 수 없음');
        return;
    }
    
    console.log('오브젝트 배치 위치:', point);
    
    // 오브젝트를 감지된 표면 위치에 배치
    artwork.setAttribute('position', {
        x: point.x,
        y: point.y + 0.25, // 바닥에서 약간 위로
        z: point.z
    });
    
    description.setAttribute('position', {
        x: point.x,
        y: point.y + 1.25, // 오브젝트 위에 텍스트 배치
        z: point.z
    });
    
    // 오브젝트 표시
    artwork.setAttribute('visible', true);
    description.setAttribute('visible', true);
    
    // 배치 애니메이션
    artwork.setAttribute('animation', {
        property: 'scale',
        from: '0 0 0',
        to: '0.5 0.5 0.5',
        dur: 500,
        easing: 'easeOutQuad'
    });
}

// 카메라 움직임에 따른 표면 감지
function handleCameraMovement() {
    const camera = document.getElementById('camera');
    const surfacePlane = document.getElementById('surface-plane');
    
    if (!camera || !surfacePlane) return;
    
    // 카메라 위치에 따라 표면 평면 위치 조정
    const cameraPosition = camera.getAttribute('position');
    const cameraRotation = camera.getAttribute('rotation');
    
    // 카메라가 바라보는 방향으로 표면 평면 배치
    const distance = 5; // 카메라에서 5미터 앞
    const radian = (cameraRotation.y * Math.PI) / 180;
    
    const surfaceX = cameraPosition.x + Math.sin(radian) * distance;
    const surfaceZ = cameraPosition.z + Math.cos(radian) * distance;
    
    surfacePlane.setAttribute('position', {
        x: surfaceX,
        y: 0, // 바닥 높이
        z: surfaceZ
    });
    
    // 표면 평면을 카메라 방향으로 회전
    surfacePlane.setAttribute('rotation', {
        x: -90,
        y: cameraRotation.y,
        z: 0
    });
}

// 디바이스 방향 처리
function handleOrientation(event) {
    const { beta, gamma } = event;
    
    if (artwork && beta && gamma) {
        // 작품 회전 애니메이션
        artwork.setAttribute('rotation', {
            x: beta - 90,
            y: gamma,
            z: 0
        });
    }
}

// 디바이스 모션 처리
function handleMotion(event) {
    const { acceleration } = event;
    
    if (artwork && acceleration) {
        // 모션의 강도에 따라 다른 애니메이션 재생
        const intensity = Math.abs(acceleration.x) + Math.abs(acceleration.y) + Math.abs(acceleration.z);
        
        if (intensity > 15) {
            // 강한 움직임 - 점프 애니메이션
            artwork.setAttribute('animation', {
                property: 'position',
                to: '0 0.5 -2',
                dur: 500,
                easing: 'easeOutQuad'
            });
        } else if (intensity > 8) {
            // 중간 움직임 - 흔들림 애니메이션
            artwork.setAttribute('animation', {
                property: 'rotation',
                to: '0 360 0',
                dur: 2000,
                easing: 'linear'
            });
        }
    }
}

// 이벤트 리스너
document.addEventListener('DOMContentLoaded', () => {
    // 언어 선택 버튼 이벤트
    document.querySelectorAll('.language-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const lang = e.target.getAttribute('data-lang');
            changeLanguage(lang);
            showSplashScreen();
        });
    });

    // 스플래시 화면 터치 이벤트
    splashScreen.addEventListener('click', () => {
        const startUI = document.getElementById('start-ui');
        if (!startUI.classList.contains('visible')) {
            showStartUI();
        }
    });

    // 시작 버튼 이벤트
    if (startExperienceButton) {
        startExperienceButton.addEventListener('click', (e) => {
            e.stopPropagation();
            startExperience();
        });
    }

    // 권한 요청 버튼 이벤트
    if (requestPermissionsButton) {
        requestPermissionsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            requestPermissions();
        });
    }

    // AR 시작 버튼 이벤트
    if (startButton) {
        startButton.addEventListener('click', (e) => {
            e.stopPropagation();
            startAR();
        });
    }

    // AR 요소들 초기화
    arElements.artwork.element = document.querySelector('#artwork');
    arElements.dolHareubang.element = document.querySelector('.dol-hareubang');
    arElements.story.element = document.querySelector('.story');
});

// AR 요소를 보여주는 함수
function showElement(element) {
    if (element) {
        element.setAttribute('visible', true);
        element.setAttribute('animation', {
            property: 'scale',
            to: '1.2 1.2 1.2',
            dur: 300,
            easing: 'easeOutQuad'
        });
    }
}

// AR 요소를 숨기는 함수
function hideElement(element) {
    if (element) {
        element.setAttribute('animation', {
            property: 'scale',
            to: '1 1 1',
            dur: 300,
            easing: 'easeOutQuad'
        });
        setTimeout(() => {
            element.setAttribute('visible', false);
        }, 300);
    }
}

// 제스처 컴포넌트 등록
AFRAME.registerComponent('gesture-detector', {
    init: function() {
        this.el.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.el.addEventListener('touchend', this.onTouchEnd.bind(this));
    },
    
    onTouchStart: function(event) {
        if (artwork) {
            artwork.setAttribute('animation', {
                property: 'scale',
                to: '0.7 0.7 0.7',
                dur: 200,
                easing: 'easeOutQuad'
            });
        }
    },
    
    onTouchEnd: function(event) {
        if (artwork) {
            artwork.setAttribute('animation', {
                property: 'scale',
                to: '0.5 0.5 0.5',
                dur: 200,
                easing: 'easeOutQuad'
            });
        }
    }
}); 