'use client';

import { useEffect, useState, useRef } from 'react';
import Matter from 'matter-js';

const KONAMI_CODE = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'b', 'a'
];

const IMAGES = ['/alerte.jpg', '/gyro.jpg', '/phare.jpg', '/frite.jpg'];

// Dimensions exactes des colliders pour correspondre au scale visuel (512px * 0.12 ~= 61px)
const IMAGE_WIDTH = 61;
const IMAGE_HEIGHT = 61;

export default function KonamiEasterEgg() {
    const [isActive, setIsActive] = useState(false);
    const [keys, setKeys] = useState<string[]>([]);

    const sceneRef = useRef<HTMLDivElement>(null);
    const engineRef = useRef<Matter.Engine | null>(null);
    const renderRef = useRef<Matter.Render | null>(null);
    const runnerRef = useRef<Matter.Runner | null>(null);

    // ── Écoute du Konami Code ──
    useEffect(() => {
        if (isActive) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const newKeys = [...keys, e.key];
            if (newKeys.length > KONAMI_CODE.length) {
                newKeys.shift();
            }
            setKeys(newKeys);

            if (newKeys.join(',') === KONAMI_CODE.join(',')) {
                setIsActive(true);
                setKeys([]); // Reset
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [keys, isActive]);

    // ── Initialisation de la scène Matter.js ──
    useEffect(() => {
        if (!isActive || !sceneRef.current) return;

        const container = sceneRef.current;
        const width = window.innerWidth;
        const height = window.innerHeight;

        // Configuration initiale de Matter.js
        const Engine = Matter.Engine,
            Render = Matter.Render,
            Runner = Matter.Runner,
            Bodies = Matter.Bodies,
            Composite = Matter.Composite,
            Mouse = Matter.Mouse,
            MouseConstraint = Matter.MouseConstraint;

        const engine = Engine.create();
        const world = engine.world;
        engineRef.current = engine;

        const render = Render.create({
            element: container,
            engine: engine,
            options: {
                width,
                height,
                background: 'transparent',
                wireframes: false,
                pixelRatio: window.devicePixelRatio
            }
        });
        renderRef.current = render;

        // Murs invisibles (sol, gauche, droite). 
        // Pas de plafond pour pouvoir les jeter en l'air.
        const wallOptions = { isStatic: true, render: { visible: false } };
        const ground = Bodies.rectangle(width / 2, height + 50, width * 2, 100, wallOptions);
        const leftWall = Bodies.rectangle(-50, height / 2, 100, height * 2, wallOptions);
        const rightWall = Bodies.rectangle(width + 50, height / 2, 100, height * 2, wallOptions);

        Composite.add(world, [ground, leftWall, rightWall]);

        // Génération des 10 images tombantes
        const bodies: Matter.Body[] = [];

        // S'assurer qu'il y a au moins une de chaque image
        const selectedImages = [...IMAGES];
        while (selectedImages.length < 60) {
            selectedImages.push(IMAGES[Math.floor(Math.random() * IMAGES.length)]);
        }

        selectedImages.forEach((imgUrl, i) => {
            // Position de départ dispersée en X, et décalée en Y pour qu'elles ne tombent pas toutes d'un bloc exact
            const startX = Math.random() * (width - 200) + 100;
            const startY = -200 - (Math.random() * 500);

            // Nous devons ajuster l'échelle pour que la texture de l'image (qui peut être grande) 
            // corresponde à une box ~ 120x120px
            // On part du principe que l'image fait ~1000px, xScale: 0.15 est une donne safe.
            // On utilise des cercles/carrés pour la physique.
            const body = Bodies.rectangle(startX, startY, IMAGE_WIDTH, IMAGE_HEIGHT, {
                restitution: 0.6, // Rebond moyen
                frictionAir: 0.01,
                render: {
                    sprite: {
                        texture: imgUrl,
                        xScale: 0.12,
                        yScale: 0.12
                    }
                }
            });
            bodies.push(body);
        });

        Composite.add(world, bodies);

        // Ajout du contrôle à la souris
        const mouse = Mouse.create(render.canvas);
        const mouseConstraint = MouseConstraint.create(engine, {
            mouse: mouse,
            constraint: {
                stiffness: 0.2,
                render: { visible: false }
            }
        });

        Composite.add(world, mouseConstraint);

        // Corriger l'interaction souris par rapport à la taille réelle du canevas
        render.mouse = mouse;

        // Démarrer la scène
        Render.run(render);
        const runner = Runner.create();
        Runner.run(runner, engine);
        runnerRef.current = runner;

        // Gérer le redimensionnement de l'écran
        const handleResize = () => {
            render.bounds.max.x = window.innerWidth;
            render.bounds.max.y = window.innerHeight;
            render.options.width = window.innerWidth;
            render.options.height = window.innerHeight;
            render.canvas.width = window.innerWidth;
            render.canvas.height = window.innerHeight;
            Matter.Body.setPosition(ground, { x: window.innerWidth / 2, y: window.innerHeight + 50 });
            Matter.Body.setPosition(rightWall, { x: window.innerWidth + 50, y: window.innerHeight / 2 });
        };

        window.addEventListener('resize', handleResize);

        // Nettoyage complet
        return () => {
            window.removeEventListener('resize', handleResize);
            if (renderRef.current) Render.stop(renderRef.current);
            if (runnerRef.current) Runner.stop(runnerRef.current);
            if (renderRef.current?.canvas) renderRef.current.canvas.remove();
            if (engineRef.current) {
                Matter.Composite.clear(engineRef.current.world, false, true);
                Engine.clear(engineRef.current);
            }
            if (container) container.innerHTML = '';
        };
    }, [isActive]);

    if (!isActive) return null;

    function handleStop() {
        setIsActive(false);
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 9999,
            pointerEvents: 'none' // Permet de cliquer sur l'UI sous-jacente si le canvas ne l'attrape pas
        }}>
            {/* Conteneur Matter.js - doit intercepter les événements souris pour la MouseConstraint */}
            <div
                ref={sceneRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'auto' }}
            />

            {/* UI de fermeture */}
            <div style={{
                position: 'absolute',
                top: 20,
                right: 20,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                padding: '16px',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                pointerEvents: 'auto',
                animation: 'slideInRight 0.3s ease-out'
            }}>
                <div style={{ fontWeight: 'bold', fontSize: '15px' }}>🎮 Konami Code Activé !</div>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Attrapez et lancez les images avec votre souris !
                </div>
                <button
                    onClick={handleStop}
                    style={{
                        padding: '8px 16px',
                        background: '#EF4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontWeight: '500',
                        marginTop: '4px'
                    }}
                >
                    Arrêter la pluie
                </button>
            </div>
        </div>
    );
}
