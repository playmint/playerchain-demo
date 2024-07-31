import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Store } from '../runtime';

export function substreamLabelSystem(
    updateStore: Store,
    renderStore: Store,
    peerId: Uint8Array,
    deltaTime: number,
) {
    // If there are updateStore ship entities without corresponding renderStore label entities, add them:
    const ship = updateStore.entities.find(
        (updateEntity) =>
            !renderStore.entities.some(
                (renderEntity) =>
                    updateEntity.labelText === renderEntity.labelText,
            ),
    );

    if (ship) {
        // Add PlayerID labels:
        const label = renderStore.add();
        label.labelText = ship.labelText;
        label.owner = ship.owner;
        console.log('added label');
    }
}

export class label {
    element!: HTMLDivElement;
    css2dObject!: CSS2DObject;
    labelText: string = '';
    textColor: string = 'white';
    getUIElement(): HTMLDivElement {
        this.element = document.createElement('div');
        this.element.className = 'label';
        this.element.style.backgroundColor = 'transparent';
        this.element.style.fontSize = '16px';
        this.element.style.fontFamily = 'Arial';
        this.element.style.textShadow = '1px 1px 3px black';

        this.updateUIElement();

        this.css2dObject = new CSS2DObject(this.element);
        this.css2dObject.position.set(0, 0, 0);
        this.css2dObject.center.set(0.5, 3);
        this.css2dObject.layers.set(0);

        return this.element;
    }

    updateUIElement(): void {
        this.element.textContent = this.labelText;
        this.element.style.color = this.textColor;
    }
}
