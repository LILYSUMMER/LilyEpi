// Three.js r165 BufferGeometryUtils.js
// 출처: https://unpkg.com/three@0.165.0/examples/jsm/utils/BufferGeometryUtils.js

// ... (파일 전체 내용이 여기에 들어갑니다. 실제 사용 시 공식 CDN에서 복사해 붙여넣으세요) ...

// (three.module.js import가 있다면)
// import * as THREE from '/assets/three.module.js';

function toTrianglesDrawMode( geometry, drawMode ) {

	if ( drawMode === 0 ) {

		return geometry;

	}

	if ( drawMode === 1 || drawMode === 2 ) {

		// generate triangles

		let index = geometry.getIndex();

		// generate index if not present

		if ( index === null ) {

			const indices = [];

			const position = geometry.getAttribute( 'position' );

			if ( position !== undefined ) {

				for ( let i = 0; i < position.count; i ++ ) {

					indices.push( i );

				}

				geometry.setIndex( indices );

				index = geometry.getIndex();

			}

		}

		const numberOfTriangles = index.count - 2;
		const newIndices = [];

		if ( drawMode === 1 ) {

			// TRIANGLE_STRIP

			for ( let i = 0; i < numberOfTriangles; i ++ ) {

				if ( i % 2 === 0 ) {

					newIndices.push( index.getX( i ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i + 2 ) );

				} else {

					newIndices.push( index.getX( i + 2 ) );
					newIndices.push( index.getX( i + 1 ) );
					newIndices.push( index.getX( i ) );

				}

			}

		} else {

			// TRIANGLE_FAN

			for ( let i = 1; i < numberOfTriangles + 1; i ++ ) {

				newIndices.push( index.getX( 0 ) );
				newIndices.push( index.getX( i ) );
				newIndices.push( index.getX( i + 1 ) );

			}

		}

		if ( newIndices.length / 3 !== numberOfTriangles ) {

			console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.' );

		}

		const newGeometry = geometry.clone();
		newGeometry.setIndex( newIndices );
		return newGeometry;

	} else {

		console.error( 'THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:', drawMode );
		return geometry;

	}

}

export { toTrianglesDrawMode }; 