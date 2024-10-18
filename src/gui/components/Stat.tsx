// const Stats = function () {
//     let mode = 0;
import { memo, useEffect, useRef, useState } from 'react';
import { Metric } from '../../runtime/metrics';

// port of MrDoob's stats.js
class Panel {
    name: string;
    min: number;
    max: number;
    round: any;
    context: any;
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    textX: number;
    textY: number;
    graphX: number;
    graphY: number;
    graphWidth: number;
    graphHeight: number;
    fg: any;
    bg: any;
    pixelRatio: number;

    constructor(
        canvas: HTMLCanvasElement,
        name: string,
        fg: string,
        bg: string,
    ) {
        this.name = name;
        this.canvas = canvas;
        this.fg = fg;
        this.bg = bg;
        this.min = Infinity;
        this.max = 0;
        this.round = Math.round;
        this.pixelRatio = this.round(globalThis.window?.devicePixelRatio || 1);

        this.width = 148 * this.pixelRatio;
        this.height = 48 * this.pixelRatio;
        this.textX = 3 * this.pixelRatio;
        this.textY = 2 * this.pixelRatio;
        this.graphX = 3 * this.pixelRatio;
        this.graphY = 15 * this.pixelRatio;
        this.graphWidth = 142 * this.pixelRatio;
        this.graphHeight = 30 * this.pixelRatio;

        this.canvas.width = this.width;
        this.canvas.height = this.height;
        // this.canvas.style.cssText = `width:${this.width}px;height:${this.height}px`;

        this.context = this.canvas.getContext('2d');
        this.context.font = `bold ${9 * this.pixelRatio}px 'Recursive Mono', monospace`;
        this.context.textBaseline = 'top';

        this.context.fillStyle = bg;
        this.context.fillRect(0, 0, this.width, this.height);

        this.context.fillStyle = fg;
        this.context.fillText(name, this.textX, this.textY);
        this.context.fillRect(
            this.graphX,
            this.graphY,
            this.graphWidth,
            this.graphHeight,
        );

        this.context.fillStyle = bg;
        this.context.globalAlpha = 0.9;
        this.context.fillRect(
            this.graphX,
            this.graphY,
            this.graphWidth,
            this.graphHeight,
        );
    }

    update(value: number, maxValue: number) {
        // const min = Math.min(this.min, value);
        // const max = Math.max(this.max, value);

        this.context.fillStyle = this.bg;
        this.context.globalAlpha = 1;
        this.context.fillRect(0, 0, this.width, this.graphY);
        this.context.fillStyle = this.fg;
        this.context.fillText(
            `${this.round(value)} ${this.name}`,
            this.textX,
            this.textY,
        );

        this.context.drawImage(
            this.canvas,
            this.graphX + this.pixelRatio,
            this.graphY,
            this.graphWidth - this.pixelRatio,
            this.graphHeight,
            this.graphX,
            this.graphY,
            this.graphWidth - this.pixelRatio,
            this.graphHeight,
        );

        this.context.fillRect(
            this.graphX + this.graphWidth - this.pixelRatio,
            this.graphY,
            this.pixelRatio,
            this.graphHeight,
        );

        this.context.fillStyle = this.bg;
        this.context.globalAlpha = 0.9;
        this.context.fillRect(
            this.graphX + this.graphWidth - this.pixelRatio,
            this.graphY,
            this.pixelRatio,
            this.round((1 - value / maxValue) * this.graphHeight),
        );
    }
}

export default memo(function Stat({ metric }: { metric: Metric }) {
    const [panel, setPanel] = useState<Panel | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!canvasRef.current) {
            return;
        }
        if (!metric) {
            return;
        }
        const canvas = canvasRef.current;
        const panel = new Panel(canvas, metric.name, '#aaa', '#333');
        setPanel(panel);
    }, [metric]);
    useEffect(() => {
        if (!panel) {
            return;
        }
        return metric.subscribe((value) => {
            panel.update(value, metric.max);
        });
    }, [metric, panel]);
    return (
        <canvas
            ref={canvasRef}
            title={metric.description.replace(/(\s|\n)+/g, ' ')}
            style={{ height: '4rem', marginTop: '1rem', marginLeft: '5px' }}
        />
    );
});
