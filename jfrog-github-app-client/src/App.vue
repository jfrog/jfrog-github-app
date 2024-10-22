<template>
  <div id="app">
    <div class="container">
      <div class="side-bar">
        <img alt="jfrog logo" class="logo"  src="./assets/logo.svg">
      </div>
      <div class="content">
        <SetUp/>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import SetUp from './components/SetUp.vue';

export default defineComponent({
  name: 'App',
  components: {
    SetUp
  }
});
</script>


<style>

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box; /* Ensures padding and border are included in element's total width/height */
}

#app {
  font-family: Open Sans,Helvetica Neue,Helvetica,Arial,sans-serif!important;
  color: #2c3e50;
}

.container {
  display: flex; /* Flexbox layout */
  height: 100vh; /* Full height of the viewport */
}

.side-bar {
  width: 27%;
  height: 100%;
  background-image: url(./assets/login-side.svg);
  background-position: 50%;
  background-repeat: no-repeat;
  background-size: cover;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.content {
  flex-grow: 1; /* The content will take the remaining space */
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.logo {
  width: 210px;
  margin: 0 auto;
  display: block;
  position: relative;
  top: 50%;
  transform: translateY(-50%);
}

</style>
