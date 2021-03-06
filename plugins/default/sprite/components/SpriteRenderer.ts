let THREE = SupEngine.THREE;

import { SpriteAssetPub } from "../data/SpriteAsset";
import { SpriteAnimationPub } from "../data/SpriteAnimations";
import SpriteRendererUpdater from "./SpriteRendererUpdater";

export default class SpriteRenderer extends SupEngine.ActorComponent {
  /* tslint:disable:variable-name */
  static Updater = SpriteRendererUpdater;
  /* tslint:enable:variable-name */

  opacity: number;
  color = { r: 1, g: 1, b: 1 };
  hasFrameBeenUpdated = false;

  asset: SpriteAssetPub;
  geometry: THREE.PlaneBufferGeometry;
  material: THREE.MeshBasicMaterial|THREE.MeshPhongMaterial|THREE.ShaderMaterial;
  materialType = "basic";
  shaderAsset: any;
  blending = "normal";
  threeMesh: THREE.Mesh;
  horizontalFlip = false;
  verticalFlip = false;
  castShadow = false;
  receiveShadow = false;

  animationsByName: { [name: string]: SpriteAnimationPub };
  animation: SpriteAnimationPub;
  animationName: string;
  isAnimationPlaying: boolean;
  animationLooping: boolean;
  animationTimer: number;
  playbackSpeed = 1;

  private frameToSecond: number;

  constructor(actor: SupEngine.Actor) {
    super(actor, "SpriteRenderer");
  }

  setSprite(asset: SpriteAssetPub, materialType?: string, customShader?: any, blending?: string) {
    this._clearMesh();

    this.asset = asset;
    if (materialType != null) this.materialType = materialType;
    if (customShader != null) this.shaderAsset = customShader;
    this.animationName = null;
    this.animationsByName = {};
    if (this.asset == null || this.asset.textures[this.asset.mapSlots["map"]] == null) return;

    this.frameToSecond = this.actor.gameInstance.framesPerSecond / this.asset.framesPerSecond;
    this.updateAnimationsByName();

    this.geometry = new THREE.PlaneBufferGeometry(this.asset.grid.width, this.asset.grid.height);

    if (this.materialType === "shader") {
      this.material = SupEngine.componentClasses["Shader"].createShaderMaterial(
        this.shaderAsset, this.asset.textures, this.geometry
      );
      (<any>this.material).map = this.asset.textures[this.asset.mapSlots["map"]];

    } else {
      let material: THREE.MeshBasicMaterial|THREE.MeshPhongMaterial;
      if (this.materialType === "basic") material = new THREE.MeshBasicMaterial();
      else if (this.materialType === "phong") {
        material = new THREE.MeshPhongMaterial();
        (<THREE.MeshPhongMaterial>material).lightMap = this.asset.textures[this.asset.mapSlots["light"]];
      }

      material.map = this.asset.textures[this.asset.mapSlots["map"]];
      material.specularMap = this.asset.textures[this.asset.mapSlots["specular"]];
      material.alphaMap = this.asset.textures[this.asset.mapSlots["alpha"]];
      if (this.materialType === "phong") (<THREE.MeshPhongMaterial>material).normalMap = this.asset.textures[this.asset.mapSlots["normal"]];
      material.alphaTest = this.asset.alphaTest;
      this.material = material;
      this.setOpacity(this.opacity);
    }
    this.material.side = THREE.DoubleSide;
    this.setColor(this.color.r, this.color.g, this.color.b);
    if (blending != null) this.setBlending(blending);

    // TEMP
    // this.asset.textures["map"].wrapS = THREE.RepeatWrapping;
    // this.asset.textures["map"].wrapT = THREE.RepeatWrapping;

    this.threeMesh = new THREE.Mesh(this.geometry, this.material);
    this.setCastShadow(this.castShadow);
    this.threeMesh.receiveShadow = this.receiveShadow;

    this.setFrame(0);
    this.actor.threeObject.add(this.threeMesh);
    this.updateShape();
  }

  setColor(r: number, g: number, b: number) {
    this.color.r = r;
    this.color.g = g;
    this.color.b = b;
    if (this.material == null) return;

    if (this.material instanceof THREE.ShaderMaterial) {
      let uniforms = (<THREE.ShaderMaterial>this.material).uniforms;
      if (uniforms.color != null) uniforms.color.value.setRGB(r, g, b);
    } else (<THREE.MeshBasicMaterial>this.material).color.setRGB(r, g, b);
    this.material.needsUpdate = true;
   }

  updateShape() {
    if (this.threeMesh == null) return;

    let scaleRatio = 1 / this.asset.pixelsPerUnit;
    this.threeMesh.scale.set(scaleRatio, scaleRatio, scaleRatio);
    let x: number;
    if (this.horizontalFlip) x = this.asset.origin.x - 0.5;
    else x = 0.5 - this.asset.origin.x;
    let y: number;
    if (this.verticalFlip) y = this.asset.origin.y - 0.5;
    else y = 0.5 - this.asset.origin.y;
    this.threeMesh.position.setX(x * this.asset.grid.width * scaleRatio);
    this.threeMesh.position.setY(y * this.asset.grid.height * scaleRatio);
    this.threeMesh.updateMatrixWorld(false);
  }

  setOpacity(opacity: number) {
    this.opacity = opacity;
    if (this.material == null) return;

    if (this.opacity != null) {
      this.material.transparent = true;
      this.material.opacity = this.opacity;
    } else {
      this.material.transparent = false;
      this.material.opacity = 1;
    }
    this.material.needsUpdate = true;
  }

  setBlending(blending: string){
      switch (blending) {
          case "normal":
            this.material.blending = THREE.NormalBlending;
            break;
          case "additive":
            this.material.blending = THREE.AdditiveBlending;
            break;
          case "subtractive":
            this.material.blending = THREE.SubtractiveBlending;
            break;
          case "multiply":
            this.material.blending = THREE.MultiplyBlending;
            break;
      }
  }

  setHorizontalFlip(horizontalFlip: boolean) {
    this.horizontalFlip = horizontalFlip;
    if (this.asset == null) return;

    this.updateShape();
    if (this.animationName == null) this.setFrame(0);
    else this.updateFrame(false);
  }

  setVerticalFlip(verticalFlip: boolean) {
    this.verticalFlip = verticalFlip;
    if (this.asset == null) return;

    this.updateShape();
    if (this.animationName == null) this.setFrame(0);
    else this.updateFrame(false);
  }

  updateAnimationsByName() {
    this.animationsByName = {};
    for(let animation of this.asset.animations) {
      this.animationsByName[animation.name] = animation;
    }
  }

  _clearMesh() {
    if (this.threeMesh == null) return;
    this.actor.threeObject.remove(this.threeMesh);
    this.threeMesh.geometry.dispose();
    this.threeMesh.material.dispose();
    this.threeMesh = null;
    this.material = null;
  }

  setCastShadow(castShadow: boolean) {
    this.castShadow = castShadow;
    this.threeMesh.castShadow = castShadow;
    if (!castShadow) return;

    this.actor.gameInstance.threeScene.traverse((object: any) => {
      let material: THREE.Material = object.material;
      if (material != null) material.needsUpdate = true;
    });
  }

  _destroy() {
    this._clearMesh();
    this.asset = null;
    super._destroy();
  }

  setFrame(frame: number) {
    let map: THREE.Texture = (<any>this.material).map;

    let frameX: number, frameY: number;
    if (this.asset.frameOrder === "rows") {
      let framesPerRow = Math.floor((<any>map).size.width / this.asset.grid.width);
      frameX = frame % framesPerRow;
      frameY = Math.floor(frame / framesPerRow);
    } else {
      let framesPerColumn = Math.floor((<any>map).size.height / this.asset.grid.height);
      frameX = Math.floor(frame / framesPerColumn);
      frameY = frame % framesPerColumn;
    }

    let left   = (frameX     * this.asset.grid.width) / (<any>map).size.width;
    let right  = ((frameX + 1) * this.asset.grid.width) / (<any>map).size.width;
    let bottom = ((<any>map).size.height - (frameY + 1) * this.asset.grid.height) / (<any>map).size.height;
    let top    = ((<any>map).size.height - frameY     * this.asset.grid.height) / (<any>map).size.height;

    if (this.horizontalFlip) [ left, right ] = [ right, left ];
    if (this.verticalFlip) [ top, bottom ] = [ bottom, top ];

    let uvs = <THREE.BufferAttribute>this.geometry.getAttribute("uv");
    uvs.needsUpdate = true;

    uvs.array[0] = left ; uvs.array[1] = top;
    uvs.array[2] = right; uvs.array[3] = top;
    uvs.array[4] = left ; uvs.array[5] = bottom;
    uvs.array[6] = right; uvs.array[7] = bottom;
  }

  setAnimation(newAnimationName: string, newAnimationLooping = true) {
    if (newAnimationName != null) {
      let animation = this.animationsByName[newAnimationName];
      if (animation == null) throw new Error(`Animation ${newAnimationName} doesn't exist`);

      this.animationLooping = newAnimationLooping;
      if (newAnimationName === this.animationName && this.isAnimationPlaying ) return;

      this.animation = animation;
      this.animationName = newAnimationName;
      if (this.playbackSpeed * animation.speed >= 0) this.animationTimer = 0;
      else this.animationTimer = this.getAnimationFrameCount() / this.frameToSecond - 1;
      this.isAnimationPlaying = true;
      this.updateFrame();
    }
    else {
      this.animation = null;
      this.animationName = null;
      this.setFrame(0);
    }
  }

  getAnimation() { return this.animationName; }

  setAnimationFrameTime(frameTime: number) {
    if (this.animationName == null) return;
    if (frameTime < 0 || frameTime > this.getAnimationFrameCount()) throw new Error(`Frame time must be >= 0 and < ${this.getAnimationFrameCount()}`);

    this.animationTimer = frameTime * this.frameToSecond;
    this.updateFrame();
  }

  getAnimationFrameTime() {
    if (this.animationName == null) return 0;
    return this.computeAbsoluteFrameTime() - this.animation.startFrameIndex;
  }

  getAnimationFrameIndex() {
    if (this.animationName == null) return 0;
    return Math.floor(this.computeAbsoluteFrameTime()) - this.animation.startFrameIndex;
  }

  getAnimationFrameCount() {
    if (this.animationName == null) return 0;
    return this.animation.endFrameIndex - this.animation.startFrameIndex + 1;
  }

  playAnimation(animationLooping = true) {
    this.animationLooping = animationLooping;
    this.isAnimationPlaying = true;
    if (this.animationLooping) return;

    if (this.playbackSpeed * this.animation.speed > 0 && this.getAnimationFrameIndex() === this.getAnimationFrameCount() - 1)
      this.animationTimer = 0;
    else if (this.playbackSpeed * this.animation.speed < 0 && this.getAnimationFrameIndex() === 0)
      this.animationTimer = (this.getAnimationFrameCount() - 0.01) * this.frameToSecond;
  }
  pauseAnimation() { this.isAnimationPlaying = false; }

  stopAnimation() {
    if (this.animationName == null) return;

    this.isAnimationPlaying = false;
    this.animationTimer = 0;
    this.updateFrame();
  }

  computeAbsoluteFrameTime() {
    let frame = this.animation.startFrameIndex;
    frame += this.animationTimer / this.frameToSecond;
    return frame;
  }

  updateFrame(flagFrameUpdated = true) {
    if (flagFrameUpdated) this.hasFrameBeenUpdated = true;

    let frame = Math.floor(this.computeAbsoluteFrameTime());
    if (frame > this.animation.endFrameIndex) {
      if (this.animationLooping) {
        frame = this.animation.startFrameIndex;
        this.animationTimer = this.playbackSpeed * this.animation.speed;
      }
      else {
        frame = this.animation.endFrameIndex;
        this.animationTimer = (this.getAnimationFrameCount() - 0.01) * this.frameToSecond;
        this.isAnimationPlaying = false;
      }

    } else if (frame < this.animation.startFrameIndex) {
      if (this.animationLooping) {
        frame = this.animation.endFrameIndex;
        this.animationTimer = (this.getAnimationFrameCount() - 0.01) * this.frameToSecond + this.playbackSpeed * this.animation.speed;
      }
      else {
        frame = this.animation.startFrameIndex;
        this.animationTimer = 0;
        this.isAnimationPlaying = false;
      }
    }
    this.setFrame(frame);
  }

  update() {
    if (this.material != null) {
      let uniforms = (<THREE.ShaderMaterial>this.material).uniforms;
      if (uniforms != null) uniforms.time.value += 1 / this.actor.gameInstance.framesPerSecond;
    }

    if (this.hasFrameBeenUpdated) {
      this.hasFrameBeenUpdated = false;
      return;
    }

    this._tickAnimation();
    this.hasFrameBeenUpdated = false;
  }

  _tickAnimation() {
    if (this.animationName == null || !this.isAnimationPlaying) return;

    this.animationTimer += this.playbackSpeed * this.animation.speed;
    this.updateFrame();
  }

  setIsLayerActive(active: boolean) { if (this.threeMesh != null) this.threeMesh.visible = active; }
}
