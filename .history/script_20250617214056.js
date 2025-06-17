// AR 요소들의 상태를 관리하는 객체
const arElements = {
    artwork: {
        element: null,
        latitude: 33.236691,  // 지정된 위치
        longitude: 126.481064,
        triggerDistance: 20,  // 미터 단위
        description: "이중섭의 '황소' 작품"
    },
    dolHareubang: {
        element: null,
        latitude: 33.236691,  // 같은 위치에 배치
        longitude: 126.481064,
        triggerDistance: 20,
        description: "제주의 상징, 돌하르방"
    },
    story: {
        element: null,
        latitude: 33.236691,  // 같은 위치에 배치
        longitude: 126.481064,
        triggerDistance: 20,
        description: "강정마을의 전설"
    }
};

// 다국어 텍스트
const i18n = {
    ko: {
        subtitle: "첫번째 에피소드 : 이중섭",
        start: "시작하기"
    },
    en: {
        subtitle: "First Episode : Lee Jung-seop",
        start: "Start"
    },
    ja: {
        subtitle: "第一話：イ・ジュンソプ",
        start: "スタート"
    },
    zh: {
        subtitle: "第一集：李仲燮",
        start: "开始"
    }
};

// DOM 요소
const languageScreen = document.getElementById('language-screen');
const splashScreen = document.getElementById('splash-screen');
const nfcScreen = document.getElementById('nfc-screen');
const startScreen = document.getElementById('start-screen');
const arScene = document.getElementById('ar-scene');
const startExperienceButton = document.getElementById('start-experience');
const startButton = document.getElementById('start-ar');
const character = document.getElementById('character');
const startUI = document.getElementById('start-ui');

// 현재 선택된 언어
let currentLanguage = 'ko';

// 언어 변경 함수
function changeLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.textContent = i18n[lang][key];
    });
}

// 스플래시 화면으로 전환
function showSplashScreen() {
    languageScreen.classList.add('hidden');
    splashScreen.classList.remove('hidden');
}

// 시작 UI 표시
function showStartUI() {
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
            showStartScreen();
        });

    } catch (error) {
        console.log("NFC 사용 불가:", error);
        // NFC를 사용할 수 없는 경우 바로 시작 화면으로 이동
        showStartScreen();
    }
}

// 화면 전환 함수들
function showStartScreen() {
    nfcScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
}

// AR 시작
function startAR() {
    startScreen.classList.add('hidden');
    arScene.classList.remove('hidden');
    character.setAttribute('visible', true);
}

// AR 초기화 및 모션 감지 설정
function initAR() {
    // 디바이스 방향 감지 설정
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleOrientation);
    }

    // 디바이스 모션 감지 설정
    if (window.DeviceMotionEvent) {
        window.addEventListener('devicemotion', handleMotion);
    }
}

// 디바이스 방향 처리
function handleOrientation(event) {
    const { beta, gamma } = event;
    
    if (character && beta && gamma) {
        // 캐릭터 회전 애니메이션
        character.setAttribute('rotation', {
            x: beta - 90,
            y: gamma,
            z: 0
        });
    }
}

// 디바이스 모션 처리
function handleMotion(event) {
    const { acceleration } = event;
    
    if (character && acceleration) {
        // 모션의 강도에 따라 다른 애니메이션 재생
        const intensity = Math.abs(acceleration.x) + Math.abs(acceleration.y) + Math.abs(acceleration.z);
        
        if (intensity > 15) {
            character.setAttribute('animation-mixer', { clip: 'jump' });
        } else if (intensity > 8) {
            character.setAttribute('animation-mixer', { clip: 'walk' });
        } else {
            character.setAttribute('animation-mixer', { clip: 'idle' });
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
        if (!startUI.classList.contains('visible')) {
            showStartUI();
        }
    });

    // 시작 버튼 이벤트
    document.getElementById('start-experience').addEventListener('click', (e) => {
        e.stopPropagation(); // 스플래시 화면 클릭 이벤트 전파 방지
        startAR();
    });

    // AR 마커 이벤트
    const marker = document.querySelector('a-marker');
    marker.addEventListener('markerFound', () => {
        console.log('마커 인식됨');
        character.setAttribute('visible', true);
    });
    
    marker.addEventListener('markerLost', () => {
        console.log('마커 인식 lost');
        character.setAttribute('visible', false);
    });

    // AR 요소들 초기화
    arElements.artwork.element = document.querySelector('.artwork');
    arElements.dolHareubang.element = document.querySelector('.dol-hareubang');
    arElements.story.element = document.querySelector('.story');

    // 커서 이벤트 리스너 설정
    const cursor = document.querySelector('#cursor');
    
    // 커서가 요소에 진입할 때
    cursor.addEventListener('mouseenter', (event) => {
        const target = event.detail.intersection.object;
        if (target.classList.contains('interactive')) {
            showElement(target);
        }
    });

    // 커서가 요소에서 벗어날 때
    cursor.addEventListener('mouseleave', (event) => {
        const target = event.detail.intersection.object;
        if (target.classList.contains('interactive')) {
            hideElement(target);
        }
    });
});

// AR 요소를 보여주는 함수
function showElement(element) {
    element.setAttribute('visible', true);
    element.setAttribute('animation', {
        property: 'scale',
        to: '1.2 1.2 1.2',
        dur: 300,
        easing: 'easeOutQuad'
    });
}

// AR 요소를 숨기는 함수
function hideElement(element) {
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

// GPS 좌표 간 거리 계산 함수 (미터 단위)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // 지구의 반지름 (미터)
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // 미터 단위 거리
}

// 제스처 컴포넌트 등록
AFRAME.registerComponent('gesture-detector', {
    init: function() {
        this.el.addEventListener('touchstart', this.onTouchStart.bind(this));
        this.el.addEventListener('touchend', this.onTouchEnd.bind(this));
    },
    
    onTouchStart: function(event) {
        character.setAttribute('animation-mixer', { clip: 'wave' });
    },
    
    onTouchEnd: function(event) {
        character.setAttribute('animation-mixer', { clip: 'idle' });
    }
});

// GPS 및 센서 권한 요청을 위한 UI 생성
function createPermissionUI() {
    const permissionDiv = document.createElement('div');
    permissionDiv.style.position = 'fixed';
    permissionDiv.style.top = '50%';
    permissionDiv.style.left = '50%';
    permissionDiv.style.transform = 'translate(-50%, -50%)';
    permissionDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    permissionDiv.style.padding = '20px';
    permissionDiv.style.borderRadius = '10px';
    permissionDiv.style.color = 'white';
    permissionDiv.style.textAlign = 'center';
    permissionDiv.style.zIndex = '10000';
    permissionDiv.id = 'permission-ui';

    const title = document.createElement('h2');
    title.textContent = 'AR 체험을 위한 권한이 필요합니다';
    title.style.marginBottom = '20px';

    const gpsButton = document.createElement('button');
    gpsButton.textContent = 'GPS 권한 허용';
    gpsButton.style.padding = '10px 20px';
    gpsButton.style.marginBottom = '10px';
    gpsButton.style.backgroundColor = '#4CAF50';
    gpsButton.style.border = 'none';
    gpsButton.style.borderRadius = '5px';
    gpsButton.style.color = 'white';
    gpsButton.style.cursor = 'pointer';
    gpsButton.style.width = '100%';

    const sensorButton = document.createElement('button');
    sensorButton.textContent = '동작 센서 권한 허용';
    sensorButton.style.padding = '10px 20px';
    sensorButton.style.backgroundColor = '#2196F3';
    sensorButton.style.border = 'none';
    sensorButton.style.borderRadius = '5px';
    sensorButton.style.color = 'white';
    sensorButton.style.cursor = 'pointer';
    sensorButton.style.width = '100%';

    const status = document.createElement('p');
    status.style.marginTop = '10px';
    status.style.fontSize = '14px';
    status.id = 'permission-status';

    permissionDiv.appendChild(title);
    permissionDiv.appendChild(gpsButton);
    permissionDiv.appendChild(sensorButton);
    permissionDiv.appendChild(status);

    document.body.appendChild(permissionDiv);

    return { permissionDiv, gpsButton, sensorButton, status };
}

// 권한 상태 확인
async function checkPermissions() {
    let gpsGranted = false;
    let sensorGranted = false;

    // GPS 권한 확인
    try {
        const permissionStatus = await navigator.permissions.query({ name: 'geolocation' });
        gpsGranted = permissionStatus.state === 'granted';
    } catch (error) {
        console.error('GPS 권한 확인 실패:', error);
    }

    // 센서 권한 확인
    try {
        const permissionStatus = await navigator.permissions.query({ name: 'accelerometer' });
        sensorGranted = permissionStatus.state === 'granted';
    } catch (error) {
        // iOS에서는 DeviceOrientationEvent.requestPermission()을 사용
        if (typeof DeviceOrientationEvent !== 'undefined' && 
            typeof DeviceOrientationEvent.requestPermission === 'function') {
            sensorGranted = false;
        } else {
            // 이외의 경우는 권한이 필요 없는 것으로 간주
            sensorGranted = true;
        }
    }

    return { gpsGranted, sensorGranted };
}

// 권한 요청 처리
async function handlePermissions() {
    const ui = createPermissionUI();
    const { gpsGranted, sensorGranted } = await checkPermissions();

    if (gpsGranted && sensorGranted) {
        ui.permissionDiv.remove();
        initializeAR();
        return;
    }

    // GPS 권한 요청 버튼 처리
    ui.gpsButton.addEventListener('click', async () => {
        try {
            // iOS Safari에서는 사용자 제스처(클릭)가 필요함
            if (navigator.userAgent.match(/iPhone|iPad|iPod/i)) {
                ui.status.textContent = 'GPS 권한 요청 중...';
                // iOS에서는 watchPosition을 먼저 호출하는 것이 더 안정적
                const watchId = navigator.geolocation.watchPosition(
                    (position) => {
                        navigator.geolocation.clearWatch(watchId);
                        ui.status.textContent = 'GPS 권한이 허용되었습니다.';
                        ui.gpsButton.style.backgroundColor = '#4CAF50';
                        ui.gpsButton.disabled = true;
                        
                        // 모든 권한이 허용되었는지 확인
                        checkPermissions().then(({ sensorGranted }) => {
                            if (sensorGranted) {
                                ui.permissionDiv.remove();
                                initializeAR();
                            }
                        });
                    },
                    (error) => {
                        console.error('GPS 오류:', error);
                        switch(error.code) {
                            case error.PERMISSION_DENIED:
                                ui.status.textContent = 'GPS 권한이 거부되었습니다. 설정에서 위치 권한을 허용해주세요.';
                                break;
                            case error.POSITION_UNAVAILABLE:
                                ui.status.textContent = '위치를 확인할 수 없습니다. GPS 신호가 약한 곳일 수 있습니다.';
                                break;
                            case error.TIMEOUT:
                                ui.status.textContent = 'GPS 위치 확인 시간이 초과되었습니다.';
                                break;
                            default:
                                ui.status.textContent = 'GPS 오류: ' + error.message;
                        }
                        ui.gpsButton.style.backgroundColor = '#f44336';
                    },
                    {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: 10000
                    }
                );
            } else {
                // 다른 브라우저에서는 기존 방식 사용
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        maximumAge: 0,
                        timeout: 10000
                    });
                });
                ui.status.textContent = 'GPS 권한이 허용되었습니다.';
                ui.gpsButton.style.backgroundColor = '#4CAF50';
                ui.gpsButton.disabled = true;
                
                // 모든 권한이 허용되었는지 확인
                const { sensorGranted } = await checkPermissions();
                if (sensorGranted) {
                    ui.permissionDiv.remove();
                    initializeAR();
                }
            }
        } catch (error) {
            console.error('GPS 권한 요청 오류:', error);
            ui.status.textContent = 'GPS 권한 요청 실패: ' + error.message;
            ui.gpsButton.style.backgroundColor = '#f44336';
        }
    });

    // 센서 권한 요청 버튼 처리
    ui.sensorButton.addEventListener('click', async () => {
        try {
            if (typeof DeviceOrientationEvent !== 'undefined' && 
                typeof DeviceOrientationEvent.requestPermission === 'function') {
                const permission = await DeviceOrientationEvent.requestPermission();
                if (permission === 'granted') {
                    ui.status.textContent = '동작 센서 권한이 허용되었습니다.';
                    ui.sensorButton.style.backgroundColor = '#4CAF50';
                    ui.sensorButton.disabled = true;

                    // 모든 권한이 허용되었는지 확인
                    const { gpsGranted } = await checkPermissions();
                    if (gpsGranted) {
                        ui.permissionDiv.remove();
                        initializeAR();
                    }
                }
            } else {
                // 권한이 필요없는 경우
                ui.sensorButton.style.backgroundColor = '#4CAF50';
                ui.sensorButton.disabled = true;
                ui.status.textContent = '동작 센서 사용 가능';
            }
        } catch (error) {
            ui.status.textContent = '동작 센서 권한 요청 실패: ' + error.message;
            ui.sensorButton.style.backgroundColor = '#f44336';
        }
    });
}

// AR 초기화 함수
function initializeAR() {
    // 기존의 AR 초기화 코드
    requestGPSPermission().then((position) => {
        if (position) {
            initARScene(position);
            
            // 디버그 정보 표시
            const debugDiv = document.createElement('div');
            debugDiv.style.position = 'fixed';
            debugDiv.style.bottom = '20px';
            debugDiv.style.left = '20px';
            debugDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
            debugDiv.style.color = 'white';
            debugDiv.style.padding = '10px';
            debugDiv.style.fontFamily = 'monospace';
            debugDiv.style.zIndex = '9999';
            document.body.appendChild(debugDiv);

            // 실시간 GPS 업데이트
            navigator.geolocation.watchPosition(
                (position) => {
                    // 현재 위치와 각 AR 요소와의 거리 계산
                    let debugInfo = `현재 위치:<br>
                        위도: ${position.coords.latitude.toFixed(6)}<br>
                        경도: ${position.coords.longitude.toFixed(6)}<br>
                        정확도: ${position.coords.accuracy.toFixed(2)}m<br><br>
                        AR 오브젝트 위치:<br>`;
                    
                    Object.keys(arElements).forEach(key => {
                        const element = arElements[key];
                        const distance = calculateDistance(
                            position.coords.latitude,
                            position.coords.longitude,
                            element.latitude,
                            element.longitude
                        );
                        
                        debugInfo += `${element.description}:<br>
                            - 위도: ${element.latitude}<br>
                            - 경도: ${element.longitude}<br>
                            - 거리: ${distance.toFixed(2)}m<br>
                            - 표시 범위: ${element.triggerDistance}m<br><br>`;
                        
                        // 거리에 따라 오브젝트 표시/숨김
                        if (element.element) {
                            element.element.setAttribute('visible', distance <= element.triggerDistance);
                        }
                    });
                    
                    debugDiv.innerHTML = debugInfo;
                },
                (error) => {
                    console.error('GPS 업데이트 오류:', error);
                    debugDiv.innerHTML = 'GPS 신호 오류 발생';
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 0,
                    timeout: 27000
                }
            );
        }
    }).catch((error) => {
        console.error('GPS 초기화 실패:', error);
    });

    // AR 화면 제스처 인식
    let touchCount = 0;
    let lastTouchTime = 0;
    const DOUBLE_TAP_DELAY = 300;

    document.querySelector('a-scene').addEventListener('touchstart', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastTouchTime;
        
        if (tapLength < DOUBLE_TAP_DELAY && tapLength > 0) {
            touchCount++;
            if (touchCount >= 3) {
                const character = document.querySelector('#character');
                character.setAttribute('visible', true);
                touchCount = 0;
            }
        } else {
            touchCount = 1;
        }
        lastTouchTime = currentTime;
    });
}

// 페이지 로드 시 권한 처리 시작
window.onload = () => {
    handlePermissions();
}; 