import { FunctionComponent } from 'react';
import styled from 'styled-components';
import backgroundImage from '../../../assets/img/start-background.png';

export const StyledScreen = styled.div`
    display: flex;
    flex-direction: column;
    width: 100vw;
    /* height: 100vh; */
    position: relative;
    padding: 40px;

    > .backgroundImage {
        pointer-events: none;
        position: absolute;
        object-fit: cover;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
    }
`;

// interface ScreenProps extends React.HTMLAttributes<HTMLDivElement> {}
export const Screen: FunctionComponent<React.HTMLAttributes<HTMLDivElement>> = (
    props,
) => {
    const { children, ...rest } = props;
    return (
        <StyledScreen {...rest}>
            <img src={backgroundImage} className={'backgroundImage'} />
            {children}
        </StyledScreen>
    );
};

export const Panel = styled.div`
    display: flex;
    flex-direction: column;

    padding: 20px;
    border: 1px solid rgb(92, 144, 255);
    border-radius: 10px;
    background-color: #111111d7;
`;

export const ScreenButton = styled.button`
    background: white;
    color: #bf6cff;
    padding: 15px 30px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 1.5rem;
    box-shadow: 0 4px 0 #bf6cff;
    cursor: pointer;
    border: none;

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
`;

export const PanelButton = styled(ScreenButton)`
    margin-bottom: 20px;

    &:last-child {
        margin-bottom: 0;
    }
`;

export const GameTitle = styled.div`
    color: white;
    font-size: 4rem;
    text-align: left;
    margin-bottom: 1rem;
    line-height: 1;
    text-align: center;
    font-weight: bold;
`;
