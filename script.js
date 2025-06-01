// AR 요소들의 상태를 관리하는 객체
const arElements = {
    artwork: {
        element: null,
        triggerDistance: 2,
        description: "이중섭의 '황소' 작품"
    },
    dolHareubang: {
        element: null,
        triggerDistance: 2,
        description: "제주의 상징, 돌하르방"
    },
    story: {
        element: null,
        triggerDistance: 2,
        description: "강정마을의 전설"
    }
};

// DOM 요소
const nfcScreen = document.getElementById('nfc-screen');
const startScreen = document.getElementById('start-screen');
const arScene = document.getElementById('ar-scene');
const startButton = document.getElementById('start-ar');
const character = document.getElementById('character');

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

function startAR() {
    startScreen.classList.add('hidden');
    arScene.classList.remove('hidden');
    initAR();
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

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    // NFC 초기화
    initNFC();
    
    // AR 시작 버튼 이벤트
    startButton.addEventListener('click', startAR);
    
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

// 거리 계산 함수
function calculateDistance(position1, position2) {
    const dx = position1.x - position2.x;
    const dy = position1.y - position2.y;
    const dz = position1.z - position2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
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