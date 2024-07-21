import { api } from "./api";

const chat = document.querySelector("textarea")!;
const input = document.querySelector("input")!;
const form = document.querySelector("form")!;

form.addEventListener("submit", (e) => {
  e.preventDefault();
  api.example.say(input.value);
  input.value = "";
});

api.example.chat.subscribe(({ from, contents }) => {
  chat.value += `${from}: ${contents}\n`;
});
