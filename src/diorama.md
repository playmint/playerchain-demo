Diorama Readme

To run diorama: pnpm dev:watch:gui
http://localhost:3344/src/diorama.html

Controls:
 - Arrowkeys - Move camera
 - 'Z' key - zoom in/out
 - 'C'/'V' keys - change ship color
 - 'W' key - toggle ship thruster effect
 - '1' key - explode ship
 - '2' key - respawn ship
 - '3' key - wall hit fx
 - '4' key - ship impact effect

To adjust explosion screen shake:
 - Go to src->examples->spaceshooter->effects->FXExplodeQuarks.ts
 - Find the following line 'addShake({'
 - intensity - How strong the shake is
 - frequency - How wobbly the shake is
 - position - Where the shake happens
 - decay - Rate at which the shake reduces
 - duration - How long the shake lasts

 To adjust the scale of the bullet:
 - Go to src->examples->spaceshooter->renderer->BulletModel.ts
 - gltf.scene.scale.set(1.1, 1.1, 1.1);
 - The physics radius for the bullet will need to be updated once the visual scale is finialised.