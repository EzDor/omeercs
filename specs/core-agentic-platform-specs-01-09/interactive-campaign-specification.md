# Interactive Campaign Specification

## What is a Campaign?
A campaign is an interactive experience that users open through a dedicated link. Users interact with the experience, play a game, and currently receive a coupon at the end.

## Building Blocks of a Campaign
- Video
- Audio (background music, game sound effects, voice-overs)
- HTML (mainly for buttons and UI overlays)
- The core experience: a Three.js game

## Recommended Initial Campaign Flow
1. Intro video
2. Three.js game
3. Outcome video (win or lose)

## Intro Video
First, generate a single image using Banana Pro on fal.ai. The model receives brand assets, campaign theme references, and instructions to place a visible Start button in the image. This image serves as the base frame for a video.

Next, pass the image to a segmentation model to detect the exact position and shape of the button. This information is later used to define the HTML clickable area.

Finally, convert the image into a looping video using a video model on fal.ai. The animation should be subtle, with the button remaining static.

## Three.js Game
The game is implemented using Three.js. The agent can generate simple games from scratch without relying on predefined templates or engines. This approach keeps the system flexible and future-proof.

## Win and Lose Videos
Win and lose videos follow the same process as the intro video. The win video includes the coupon display, while the lose video ends the experience without a reward.

## User Input and Agent Interaction
Users describe their goals at a high level, such as campaign theme, duration, brand assets, and products to promote. The agent asks clarification questions, presents visual options, and confirms decisions before generating the campaign.

## Agent Reasoning Flow
The agent applies approved themes and assets, configures game difficulty and scoring rules, and assembles the campaign flow: intro video, game, and win or lose video.

## Audio Generation
Audio is generated using the ElevenLabs API. The agent creates background music, sound effects, and voice-overs, and integrates them directly into the game experience.

---

# Interactive Campaign Specification (Copy-Paste Version)

## What is a Campaign?
A campaign is an interactive experience that users open through a dedicated link. Users interact with the experience, play a game, and currently receive a coupon at the end.

## Building Blocks of a Campaign
- Video
- Audio (background music, game sound effects, voice-overs)
- HTML (mainly for buttons and UI overlays)
- The core experience: a Three.js game

## Recommended Initial Campaign Flow
- Intro video
- Three.js game
- Outcome video (win or lose)

## Intro Video
First, generate a single image using Banana Pro on fal.ai. The model receives brand assets, campaign theme references, and instructions to place a visible Start button in the image. This image serves as the base frame for a video.

Next, pass the image to a segmentation model to detect the exact position and shape of the button. This information is later used to define the HTML clickable area.

Finally, convert the image into a looping video using a video model on fal.ai. The animation should be subtle, with the button remaining static.

## Three.js Game
The game is implemented using Three.js. The agent can generate simple games from scratch without relying on predefined templates or engines. This approach keeps the system flexible and future-proof.

## Win and Lose Videos
Win and lose videos follow the same process as the intro video. The win video includes the coupon display, while the lose video ends the experience without a reward.

## User Input and Agent Interaction
Users describe their goals at a high level, such as campaign theme, duration, brand assets, and products to promote. The agent asks clarification questions, presents visual options, and confirms decisions before generating the campaign.

## Agent Reasoning Flow
The agent applies approved themes and assets, configures game difficulty and scoring rules, and assembles the campaign flow: intro video, game, and win or lose video.

## Audio Generation
Audio is generated using the ElevenLabs API. The agent creates background music, sound effects, and voice-overs, and integrates them directly into the game experience.

