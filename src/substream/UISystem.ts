import { Entity, Renderer, Store } from '../runtime';

let muteButton: Entity;
let healthBar: Entity;

export function createGameUI(store: Store) {
    //Add mute button:
    muteButton = store.add();
    muteButton.isUI = true;
    const button = new buttonUI();
    button.textContent = 'Mute';
    button.align = 'align-top-left';
    button.position = { x: 10, y: 10 };
    button.buttonCallback = 'toggleMute';
    muteButton.UIElement = button;
    console.log('added mute button');

    // //Add health meter:
    healthBar = store.add();
    healthBar.isUI = true;
    const meter = new meterUI();
    meter.align = 'align-top';
    meter.position = { x: 0, y: 10 };
    meter.width = 150;
    meter.height = 20;
    healthBar.UIElement = meter;
    console.log('added health bar');
}

export function substreamUISystem(
    updateStore: Store,
    renderStore: Store,
    peerId: Uint8Array,
    renderer: Renderer,
    deltaTime: number,
) {
    let player;
    if (updateStore && peerId) {
        player = updateStore.entities.find((entity) => entity.owner === peerId);
    }
    if (player && healthBar) {
        (healthBar.UIElement as meterUI).fillAmount =
            1 -
            Math.sqrt(
                player?.velocity.x * player?.velocity.x +
                    player?.velocity.y * player?.velocity.y,
            ) /
                10;
        (healthBar.UIElement as meterUI).updateUIElement();
    }

    if (renderer && muteButton && (muteButton.UIElement as buttonUI).element) {
        (muteButton.UIElement as buttonUI).element.onclick = () => {
            renderer.toggleMute();
        };
    }
}

export class uiElement {
    align:
        | 'align-top'
        | 'align-bottom'
        | 'align-left'
        | 'align-right'
        | 'align-top-left'
        | 'align-top-right'
        | 'align-bottom-left'
        | 'align-bottom-right'
        | 'align-center' = 'align-center';
    position: { x: number; y: number } = { x: 0, y: 0 };
    textContent: string = 'button';
    backgroundColor: string = '#000000';
    textColor: string = '#ffffff';
    fontSize: number = 16;
    fontFamily: 'Arial' | 'Times New Roman' = 'Arial';
    textShadow: boolean = false;
    width: number = 100;
    height: number = 50;
    autoSize: boolean = false;

    element!: HTMLElement;

    getUIElement(): HTMLElement {
        this.element = document.createElement('div');
        return this.element;
    }

    updateUIElement() {
        if (!this.element) {
            return;
        }
        if (!this.autoSize) {
            this.element.style.width = this.width + 'px';
            this.element.style.height = this.height + 'px';
        }
    }
}

export class buttonUI extends uiElement {
    buttonCallback: string = '';
    getUIElement(): HTMLButtonElement {
        this.element = document.createElement('button');
        this.element.className = 'uiElement';
        this.element.classList.add(this.align);

        this.updateUIElement();
        document.body.appendChild(this.element);
        return this.element as HTMLButtonElement;
    }

    updateUIElement() {
        super.updateUIElement();
        this.element.textContent = this.textContent;

        this.element.style.backgroundColor = this.backgroundColor;
        this.element.style.color = this.textColor;
        this.element.style.fontSize = this.fontSize + 'px';
        this.element.style.fontFamily = this.fontFamily;
        this.element.style.textShadow = this.textShadow
            ? '1px 1px 3px black'
            : 'none';
        this.element.style.translate =
            this.position.x + 'px' + ' ' + this.position.y + 'px';
    }
}

export class meterUI extends uiElement {
    fillAmount: number = 0.65;
    fillColor: string = '#00ff00';
    fillElement!: HTMLDivElement;
    player!: Entity;

    getUIElement(): HTMLDivElement {
        this.element = document.createElement('div');
        this.element.className = 'uiElement';
        this.element.classList.add(this.align);

        this.fillElement = document.createElement('div');
        this.fillElement.classList.add('meterFill');

        this.updateUIElement();

        document.body.appendChild(this.element);
        this.element.appendChild(this.fillElement);
        return this.element as HTMLDivElement;
    }

    updateUIElement(): void {
        super.updateUIElement();
        if (!this.fillElement || !this.element) {
            console.log('fillElement or element not found');
            return;
        }
        this.fillElement.style.width = this.fillAmount * 100 + '%';
        this.fillElement.style.backgroundColor = this.fillColor;

        this.element.style.backgroundColor = this.backgroundColor;
        this.element.style.color = this.textColor;
        this.element.style.fontSize = this.fontSize + 'px';
        this.element.style.fontFamily = this.fontFamily;
        this.element.style.textShadow = this.textShadow
            ? '1px 1px 3px black'
            : 'none';
        this.element.style.translate =
            this.position.x + 'px' + ' ' + this.position.y + 'px';
    }
}
